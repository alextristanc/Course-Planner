import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const DIAS_VALIDOS = new Set(['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']);

function normalizarDia(dia: unknown): string | null {
  if (!dia || typeof dia !== 'string') return null;
  const limpio = dia.toLowerCase().trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (DIAS_VALIDOS.has(limpio)) return limpio;
  if (limpio.startsWith('lun') || limpio === 'l' || limpio === 'mo') return 'lun';
  if (limpio.startsWith('mar') || limpio === 'ma' || limpio === 'tu') return 'mar';
  if (limpio.startsWith('mie') || limpio.startsWith('mier') || limpio === 'mi' || limpio === 'we') return 'mie';
  if (limpio.startsWith('jue') || limpio === 'j' || limpio === 'th') return 'jue';
  if (limpio.startsWith('vie') || limpio === 'v' || limpio === 'fr') return 'vie';
  if (limpio.startsWith('sab') || limpio === 's' || limpio === 'sa') return 'sab';
  if (limpio.startsWith('dom') || limpio === 'd' || limpio === 'su') return 'dom';
  return null;
}

function normalizarHora(hora: unknown): string | null {
  if (hora === null || hora === undefined) return null;
  const s = String(hora).trim();
  if (!s) return null;

  // Acepta "7:00", "07:00", "7:00 AM", "19:30"
  const match = s.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!match) return null;

  let h = parseInt(match[1], 10);
  const m = match[2];
  const ampm = match[3]?.toLowerCase();

  if (ampm === 'pm' && h < 12) h += 12;
  if (ampm === 'am' && h === 12) h = 0;

  if (h < 0 || h > 23) return null;
  return `${String(h).padStart(2, '0')}:${m}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function mimeFromPath(path: string, fallback = 'application/octet-stream'): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  return fallback;
}

function isTextMime(mime: string): boolean {
  return mime.startsWith('text/') || mime === 'application/json' || mime === 'text/csv';
}

function sanitizeGrupos(raw: any): Array<{
  materia: string;
  profesor: string | null;
  identificador: string | null;
  horario: Array<{ dia: string; hora_inicio: string; hora_fin: string }>;
  periodo: string | null;
}> {
  const lista = Array.isArray(raw?.grupos) ? raw.grupos : Array.isArray(raw) ? raw : [];
  const resultado: Array<{
    materia: string;
    profesor: string | null;
    identificador: string | null;
    horario: Array<{ dia: string; hora_inicio: string; hora_fin: string }>;
    periodo: string | null;
  }> = [];

  for (const item of lista) {
    if (!item || typeof item !== 'object') continue;
    const materia = String(item.materia || item.nombre || item.asignatura || '').trim();
    if (!materia) continue;

    const profesor = item.profesor || item.maestro || item.docente
      ? String(item.profesor || item.maestro || item.docente).trim()
      : null;

    const identificador = item.identificador || item.grupo || item.clave || item.id_grupo
      ? String(item.identificador || item.grupo || item.clave || item.id_grupo).trim()
      : null;

    const periodo = item.periodo ? String(item.periodo).trim() : null;

    const bloquesRaw = Array.isArray(item.horario) ? item.horario : [];
    const horario: Array<{ dia: string; hora_inicio: string; hora_fin: string }> = [];

    for (const b of bloquesRaw) {
      if (!b || typeof b !== 'object') continue;
      const dia = normalizarDia(b.dia || b.day);
      const hora_inicio = normalizarHora(b.hora_inicio || b.inicio || b.start);
      const hora_fin = normalizarHora(b.hora_fin || b.fin || b.end);
      if (dia && hora_inicio && hora_fin) {
        horario.push({ dia, hora_inicio, hora_fin });
      }
    }

    resultado.push({ materia, profesor, identificador, horario, periodo });
  }

  return resultado;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Usuario no válido' }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const body = await req.json().catch(() => ({}));
    const filePath = String(body.file_path || body.path || '').trim();
    const mimeTypeHint = body.mime_type ? String(body.mime_type) : null;
    const replaceExisting = body.replace_existing !== false;

    if (!filePath) {
      return new Response(JSON.stringify({ error: 'Se requiere file_path del archivo en Storage' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    if (!filePath.startsWith(`${user.id}/`)) {
      return new Response(JSON.stringify({ error: 'Ruta de archivo no permitida' }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documentos')
      .download(filePath);

    if (downloadError || !fileData) {
      throw new Error(`No se pudo descargar el archivo: ${downloadError?.message || 'sin datos'}`);
    }

    const mimeType = mimeTypeHint || fileData.type || mimeFromPath(filePath);
    const arrayBuffer = await fileData.arrayBuffer();

    const prompt = `Eres un extractor de oferta académica. Analiza el documento de oferta de materias/grupos del periodo escolar y extrae TODOS los grupos ofertados.

Para cada grupo identifica:
- materia: nombre de la materia
- profesor: nombre del profesor (o null si no aparece)
- identificador: clave/grupo/NRC/sección (o null)
- periodo: periodo escolar si aparece (o null)
- horario: arreglo de bloques con dia, hora_inicio y hora_fin

Días válidos: lun, mar, mie, jue, vie, sab, dom
Horas en formato 24h "HH:MM" (ej. "07:00", "13:30")

Reglas:
- No inventes grupos que no estén en el documento.
- Si un grupo tiene varios días/horarios, incluye todos los bloques en "horario".
- No filtres por conflictos; extrae la oferta completa.
- Responde ÚNICAMENTE con JSON válido:
{
  "grupos": [
    {
      "materia": "string",
      "profesor": "string | null",
      "identificador": "string | null",
      "periodo": "string | null",
      "horario": [
        { "dia": "lun|mar|mie|jue|vie|sab|dom", "hora_inicio": "HH:MM", "hora_fin": "HH:MM" }
      ]
    }
  ]
}`;

    const schema = {
      type: 'object',
      properties: {
        grupos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              materia: { type: 'string' },
              profesor: { type: 'string', nullable: true },
              identificador: { type: 'string', nullable: true },
              periodo: { type: 'string', nullable: true },
              horario: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    dia: { type: 'string' },
                    hora_inicio: { type: 'string' },
                    hora_fin: { type: 'string' },
                  },
                  required: ['dia', 'hora_inicio', 'hora_fin'],
                },
              },
            },
            required: ['materia', 'horario'],
          },
        },
      },
      required: ['grupos'],
    };

    let parts: any[];

    if (isTextMime(mimeType)) {
      const text = new TextDecoder().decode(arrayBuffer);
      parts = [{ text: `${prompt}\n\nContenido del documento:\n${text.slice(0, 120000)}` }];
    } else {
      const base64 = arrayBufferToBase64(arrayBuffer);
      parts = [
        { text: prompt },
        {
          inline_data: {
            mime_type: mimeType,
            data: base64,
          },
        },
      ];
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      throw new Error('GEMINI_API_KEY no configurada en el entorno de Edge Functions');
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: schema,
          },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Error de Gemini API: ${geminiRes.status} ${errText}`);
    }

    const geminiData = await geminiRes.json();
    const textoRespuesta = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textoRespuesta) {
      throw new Error('Gemini no devolvió contenido utilizable.');
    }

    let parsed: any;
    try {
      parsed = JSON.parse(textoRespuesta);
    } catch {
      console.error('Respuesta de Gemini no es JSON válido:', textoRespuesta);
      throw new Error('La IA devolvió un formato inválido. Intenta de nuevo.');
    }

    const grupos = sanitizeGrupos(parsed);

    if (grupos.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No se encontraron grupos en el documento. Verifica el archivo.',
          grupos: [],
        }),
        { status: 422, headers: corsHeaders }
      );
    }

    // Reemplazar oferta anterior del usuario si se solicita
    if (replaceExisting) {
      // Borrar prioridades primero (FK), luego oferta
      const { data: ofertaAnterior } = await supabase
        .from('oferta_materias')
        .select('id')
        .eq('user_id', user.id);

      if (ofertaAnterior && ofertaAnterior.length > 0) {
        const ids = ofertaAnterior.map((o: any) => o.id);
        await supabase.from('prioridades_grupos').delete().in('oferta_materia_id', ids);
        await supabase.from('oferta_materias').delete().eq('user_id', user.id);
      }
    }

    const rows = grupos.map((g) => ({
      user_id: user.id,
      materia: g.materia,
      profesor: g.profesor,
      identificador: g.identificador,
      periodo: g.periodo,
      horario: g.horario,
      metadata: { source_file: filePath },
    }));

    const { data: inserted, error: insertError } = await supabase
      .from('oferta_materias')
      .insert(rows)
      .select();

    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({
        grupos: inserted,
        total: inserted?.length || 0,
        file_path: filePath,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error en extraer-oferta:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
