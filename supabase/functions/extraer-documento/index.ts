import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const ESTADOS_VALIDOS = new Set(['aprobada', 'cursando', 'pendiente']);

function normalizarEstado(estado: unknown): string {
  if (!estado || typeof estado !== 'string') return 'pendiente';
  const limpio = estado.toLowerCase().trim();
  if (ESTADOS_VALIDOS.has(limpio)) return limpio;
  if (limpio.startsWith('aprob')) return 'aprobada';
  if (limpio.startsWith('curs')) return 'cursando';
  if (limpio.startsWith('pend') || limpio.startsWith('reprob') || limpio.includes('por cursar')) {
    return 'pendiente';
  }
  return 'pendiente';
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

function sanitizeMaterias(raw: any): Array<{ nombre: string; estado: string; creditos: number | null }> {
  const lista = Array.isArray(raw?.materias) ? raw.materias : Array.isArray(raw) ? raw : [];
  const resultado: Array<{ nombre: string; estado: string; creditos: number | null }> = [];
  const vistos = new Set<string>();

  for (const item of lista) {
    if (!item || typeof item !== 'object') continue;
    const nombre = String(item.nombre || item.materia || item.name || '').trim();
    if (!nombre) continue;

    const key = nombre.toLowerCase();
    if (vistos.has(key)) continue;
    vistos.add(key);

    let creditos: number | null = null;
    if (item.creditos !== undefined && item.creditos !== null && item.creditos !== '') {
      const n = Number(item.creditos);
      if (!Number.isNaN(n)) creditos = n;
    }

    resultado.push({
      nombre,
      estado: normalizarEstado(item.estado || item.status),
      creditos,
    });
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

    if (!filePath) {
      return new Response(JSON.stringify({ error: 'Se requiere file_path del archivo en Storage' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Seguridad: el archivo debe estar bajo la carpeta del usuario
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

    const prompt = `Eres un extractor de información académica. Analiza el documento del plan de estudios o historial académico del estudiante y extrae TODAS las materias que encuentres.

Para cada materia identifica:
- nombre: nombre completo de la materia
- estado: uno de "aprobada", "cursando" o "pendiente" (si no está claro, usa "pendiente")
- creditos: número de créditos si aparece; si no, null

Reglas:
- No inventes materias que no estén en el documento.
- Si hay calificaciones aprobatorias o estados como "AC", "Aprobada", "Cursada", marca como "aprobada".
- Si dice "en curso", "cursando" o similar, marca como "cursando".
- Si no se ha cursado o está reprobada/pendiente, marca como "pendiente".
- Responde ÚNICAMENTE con JSON válido con esta forma exacta:
{
  "materias": [
    { "nombre": "string", "estado": "aprobada" | "cursando" | "pendiente", "creditos": number | null }
  ]
}`;

    const schema = {
      type: 'object',
      properties: {
        materias: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              nombre: { type: 'string' },
              estado: { type: 'string', enum: ['aprobada', 'cursando', 'pendiente'] },
              creditos: { type: 'number', nullable: true },
            },
            required: ['nombre', 'estado'],
          },
        },
      },
      required: ['materias'],
    };

    let parts: any[];

    if (isTextMime(mimeType)) {
      const text = new TextDecoder().decode(arrayBuffer);
      parts = [{ text: `${prompt}\n\nContenido del documento:\n${text.slice(0, 120000)}` }];
    } else {
      // PDF e imágenes: multimodal
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

    const materias = sanitizeMaterias(parsed);

    if (materias.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No se encontraron materias en el documento. Verifica el archivo o ingresa las materias manualmente.',
          materias: [],
        }),
        { status: 422, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({
        materias,
        total: materias.length,
        file_path: filePath,
      }),
      { status: 200, headers: corsHeaders }
    );
  } catch (error) {
    console.error('Error en extraer-documento:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
