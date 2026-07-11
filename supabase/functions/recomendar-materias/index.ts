import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

type Bloque = { dia: string; hora_inicio: string; hora_fin: string };

function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + (m || 0);
}

function bloquesSeSolapan(a: Bloque, b: Bloque): boolean {
  if (a.dia !== b.dia) return false;
  const aIni = horaAMinutos(a.hora_inicio);
  const aFin = horaAMinutos(a.hora_fin);
  const bIni = horaAMinutos(b.hora_inicio);
  const bFin = horaAMinutos(b.hora_fin);
  return aIni < bFin && bIni < aFin;
}

function horariosConflictan(
  horarioA: Bloque[] = [],
  horarioB: Bloque[] = []
): boolean {
  for (const a of horarioA) {
    for (const b of horarioB) {
      if (bloquesSeSolapan(a, b)) return true;
    }
  }
  return false;
}

function grupoChocaConRestricciones(
  horario: Bloque[] = [],
  noDisponibles: Bloque[] = []
): boolean {
  return horariosConflictan(horario, noDisponibles);
}

function filtrarRecomendacion(
  recomendacion: any,
  gruposValidos: Map<string, any>,
  userId: string
): any {
  if (!recomendacion || !Array.isArray(recomendacion.grupos)) {
    return { resumen: recomendacion?.resumen || '', grupos: [] };
  }

  const seleccionados: any[] = [];
  const materiasUsadas = new Set<string>();

  for (const g of recomendacion.grupos) {
    const id = g.oferta_id || g.id;
    if (!id || !gruposValidos.has(id)) {
      console.warn(`[recomendar-materias] Grupo inválido descartado: ${id} (usuario: ${userId})`);
      continue;
    }

    const real = gruposValidos.get(id);
    const materiaKey = (real.materia || '').toLowerCase();

    // Una sola materia por nombre
    if (materiasUsadas.has(materiaKey)) continue;

    // Verificar conflictos con ya seleccionados
    let conflicto = false;
    for (const sel of seleccionados) {
      if (horariosConflictan(real.horario || [], sel.horario || [])) {
        conflicto = true;
        break;
      }
    }
    if (conflicto) continue;

    materiasUsadas.add(materiaKey);
    seleccionados.push({
      oferta_id: real.id,
      materia: real.materia,
      profesor: real.profesor,
      identificador: real.identificador,
      horario: real.horario || [],
      prioridad: g.prioridad || real.prioridad || 'media',
      justificacion: g.justificacion || '',
      creditos: g.creditos ?? null,
    });
  }

  return {
    resumen: recomendacion.resumen || 'Recomendación generada con base en tu plan, oferta y preferencias.',
    grupos: seleccionados,
    total_materias: seleccionados.length,
    total_creditos: seleccionados.reduce(
      (sum: number, g: any) => sum + (typeof g.creditos === 'number' ? g.creditos : 0),
      0
    ),
  };
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

    // 1. Plan académico
    const { data: materias, error: materiasError } = await supabase
      .from('materias_usuario')
      .select('*')
      .eq('user_id', user.id);

    if (materiasError) throw materiasError;

    // 2. Preferencias
    const { data: preferencias, error: prefError } = await supabase
      .from('preferencias_usuario')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (prefError) throw prefError;

    // 3. Oferta
    const { data: oferta, error: ofertaError } = await supabase
      .from('oferta_materias')
      .select('*')
      .eq('user_id', user.id);

    if (ofertaError) throw ofertaError;

    // 4. Prioridades de grupos
    const { data: prioridades, error: prioError } = await supabase
      .from('prioridades_grupos')
      .select('*')
      .eq('user_id', user.id);

    if (prioError) throw prioError;

    const prioMap = new Map(
      (prioridades || []).map((p: any) => [p.oferta_materia_id, p.prioridad])
    );

    const materiasPendientes = (materias || [])
      .filter((m: any) => m.estado !== 'aprobada')
      .map((m: any) => ({
        nombre: m.nombre,
        estado: m.estado || 'pendiente',
        creditos: m.creditos ?? null,
      }));

    const nombresPendientes = new Set(
      materiasPendientes.map((m: any) => m.nombre.toLowerCase())
    );

    const horariosNoDisponibles: Bloque[] = Array.isArray(preferencias?.horarios_no_disponibles)
      ? preferencias.horarios_no_disponibles
      : [];

    // Filtrar oferta: solo materias pendientes y que no choquen con horarios no disponibles
    const ofertaRelevante = (oferta || [])
      .filter((g: any) => {
        const nombre = (g.materia || '').toLowerCase();
        // Si hay plan académico, filtrar por pendientes; si no, usar toda la oferta
        if (nombresPendientes.size > 0 && !nombresPendientes.has(nombre)) {
          // Coincidencia parcial flexible
          const match = [...nombresPendientes].some(
            (n) => nombre.includes(n) || n.includes(nombre)
          );
          if (!match) return false;
        }
        if (grupoChocaConRestricciones(g.horario || [], horariosNoDisponibles)) {
          return false;
        }
        return true;
      })
      .map((g: any) => ({
        id: g.id,
        materia: g.materia,
        profesor: g.profesor,
        identificador: g.identificador,
        horario: g.horario || [],
        periodo: g.periodo,
        prioridad: prioMap.get(g.id) || 'media',
      }));

    if (ofertaRelevante.length === 0 && (oferta || []).length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No hay oferta de materias cargada. Sube la oferta del periodo antes de generar recomendaciones.',
        }),
        { status: 422, headers: corsHeaders }
      );
    }

    if (materiasPendientes.length === 0 && (materias || []).length > 0) {
      return new Response(
        JSON.stringify({
          error: 'No hay materias pendientes. Todas tus materias están marcadas como aprobadas.',
        }),
        { status: 422, headers: corsHeaders }
      );
    }

    const contexto = {
      materias_pendientes: materiasPendientes,
      total_aprobadas: (materias?.length || 0) - materiasPendientes.length,
      oferta: ofertaRelevante,
      preferencias: {
        tipo_periodo: preferencias?.tipo_periodo || 'semestral',
        min_materias: preferencias?.min_materias ?? null,
        max_materias: preferencias?.max_materias ?? null,
        semestre_actual: preferencias?.semestre_actual ?? null,
        limite_creditos: preferencias?.limite_creditos ?? null,
        horarios_no_disponibles: horariosNoDisponibles,
      },
    };

    const idsOferta = ofertaRelevante.map((g: any) => g.id);

    const prompt = `Eres un asesor académico experto en armado de horarios. Genera una propuesta de inscripción optimizada.

DATOS DEL ESTUDIANTE:
Materias pendientes:
${JSON.stringify(contexto.materias_pendientes, null, 2)}

Materias ya aprobadas: ${contexto.total_aprobadas}
Semestre actual: ${contexto.preferencias.semestre_actual ?? 'no especificado'}

OFERTA DE GRUPOS DISPONIBLES (ya filtrada por horarios no disponibles del estudiante):
${JSON.stringify(contexto.oferta, null, 2)}

PREFERENCIAS:
- Tipo de período: ${contexto.preferencias.tipo_periodo}
- Mínimo de materias: ${contexto.preferencias.min_materias ?? 'sin especificar'}
- Máximo de materias: ${contexto.preferencias.max_materias ?? 'sin especificar'}
- Límite de créditos: ${contexto.preferencias.limite_creditos ?? 'sin especificar'}

REGLAS OBLIGATORIAS:
1. SOLO puedes recomendar grupos cuyo "id" esté en la oferta proporcionada.
2. NO elijas dos grupos con horarios que se solapen (mismo día y horas traslapadas).
3. NO elijas más de un grupo de la misma materia.
4. Respeta min/max de materias y límite de créditos si están definidos.
5. Prioriza grupos con prioridad "alta", luego "media", luego "baja".
6. Prioriza materias marcadas como "cursando".
7. Prefiere materias con más créditos o que suelen ser prerrequisito.
8. Si no hay oferta para una materia pendiente, omítela (no inventes grupos).

Responde ÚNICAMENTE con JSON:
{
  "resumen": "string breve (1-2 oraciones)",
  "grupos": [
    {
      "oferta_id": "uuid del grupo en la oferta",
      "materia": "string",
      "creditos": number | null,
      "prioridad": "alta" | "media" | "baja",
      "justificacion": "string breve"
    }
  ]
}`;

    const schema = {
      type: 'object',
      properties: {
        resumen: { type: 'string' },
        grupos: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              oferta_id: {
                type: 'string',
                ...(idsOferta.length > 0 ? { enum: idsOferta } : {}),
              },
              materia: { type: 'string' },
              creditos: { type: 'number', nullable: true },
              prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
              justificacion: { type: 'string' },
            },
            required: ['oferta_id', 'materia', 'prioridad', 'justificacion'],
          },
        },
      },
      required: ['resumen', 'grupos'],
    };

    // Si no hay oferta relevante, generar plan solo con materias pendientes (fallback multi-periodo)
    if (ofertaRelevante.length === 0) {
      const promptFallback = `Eres un asesor académico. El estudiante no tiene oferta de grupos cargada o no hay coincidencias.
Genera un plan de materias por períodos con las materias pendientes.

Materias pendientes:
${JSON.stringify(contexto.materias_pendientes, null, 2)}

Preferencias:
- Tipo de período: ${contexto.preferencias.tipo_periodo}
- Mín materias: ${contexto.preferencias.min_materias ?? 'N/A'}
- Máx materias: ${contexto.preferencias.max_materias ?? 'N/A'}
- Límite créditos: ${contexto.preferencias.limite_creditos ?? 'N/A'}

Responde SOLO JSON:
{
  "resumen": "string",
  "periodos": [
    {
      "numero": 1,
      "materias": [
        { "nombre": "string", "creditos": number | null, "prioridad": "alta"|"media"|"baja", "justificacion": "string" }
      ]
    }
  ]
}`;

      const nombresMaterias = materiasPendientes.map((m: any) => m.nombre);
      const schemaFallback = {
        type: 'object',
        properties: {
          resumen: { type: 'string' },
          periodos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                numero: { type: 'integer' },
                materias: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      nombre: { type: 'string', enum: nombresMaterias.length ? nombresMaterias : undefined },
                      creditos: { type: 'number', nullable: true },
                      prioridad: { type: 'string', enum: ['alta', 'media', 'baja'] },
                      justificacion: { type: 'string' },
                    },
                    required: ['nombre', 'prioridad', 'justificacion'],
                  },
                },
              },
              required: ['numero', 'materias'],
            },
          },
        },
        required: ['resumen', 'periodos'],
      };

      const geminiKey = Deno.env.get('GEMINI_API_KEY');
      if (!geminiKey) throw new Error('GEMINI_API_KEY no configurada');

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptFallback }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: schemaFallback,
            },
          }),
        }
      );

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        throw new Error(`Error de Gemini API: ${geminiRes.status} ${errText}`);
      }

      const geminiData = await geminiRes.json();
      const texto = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!texto) throw new Error('Gemini no devolvió contenido utilizable.');

      let recomendacion = JSON.parse(texto);
      const nombresValidos = new Set(materiasPendientes.map((m: any) => m.nombre));
      if (Array.isArray(recomendacion.periodos)) {
        recomendacion.periodos = recomendacion.periodos
          .map((p: any) => ({
            ...p,
            materias: (p.materias || []).filter((m: any) => nombresValidos.has(m.nombre)),
          }))
          .filter((p: any) => p.materias?.length > 0);
      }
      recomendacion.modo = 'plan_periodos';
      recomendacion.grupos = [];

      const { data: inserted, error: insertError } = await supabase
        .from('recomendaciones')
        .insert({ user_id: user.id, resultado: recomendacion })
        .select()
        .single();

      if (insertError) throw insertError;

      return new Response(JSON.stringify({ recomendacion: inserted }), {
        status: 200,
        headers: corsHeaders,
      });
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) throw new Error('GEMINI_API_KEY no configurada');

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
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

    let recomendacionRaw: any;
    try {
      recomendacionRaw = JSON.parse(textoRespuesta);
    } catch {
      console.error('Respuesta de Gemini no es JSON válido:', textoRespuesta);
      throw new Error('La IA devolvió un formato inválido. Intenta de nuevo.');
    }

    // Enriquecer créditos desde plan académico
    const creditosPorMateria = new Map(
      materiasPendientes.map((m: any) => [m.nombre.toLowerCase(), m.creditos])
    );

    if (Array.isArray(recomendacionRaw.grupos)) {
      for (const g of recomendacionRaw.grupos) {
        if (g.creditos == null && g.materia) {
          g.creditos = creditosPorMateria.get(String(g.materia).toLowerCase()) ?? null;
        }
      }
    }

    const gruposValidos = new Map(ofertaRelevante.map((g: any) => [g.id, g]));
    const recomendacion = filtrarRecomendacion(recomendacionRaw, gruposValidos, user.id);
    recomendacion.modo = 'inscripcion_grupos';

    // Validar límites post-filtro
    const maxMat = preferencias?.max_materias;
    if (maxMat && recomendacion.grupos.length > maxMat) {
      recomendacion.grupos = recomendacion.grupos.slice(0, maxMat);
      recomendacion.total_materias = recomendacion.grupos.length;
    }

    const limiteCred = preferencias?.limite_creditos
      ? Number(preferencias.limite_creditos)
      : null;
    if (limiteCred) {
      let acum = 0;
      const filtrados: any[] = [];
      for (const g of recomendacion.grupos) {
        const c = typeof g.creditos === 'number' ? g.creditos : 0;
        if (acum + c <= limiteCred) {
          filtrados.push(g);
          acum += c;
        }
      }
      recomendacion.grupos = filtrados;
      recomendacion.total_materias = filtrados.length;
      recomendacion.total_creditos = acum;
    }

    const { data: inserted, error: insertError } = await supabase
      .from('recomendaciones')
      .insert({ user_id: user.id, resultado: recomendacion })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ recomendacion: inserted }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error('Error en recomendar-materias:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
