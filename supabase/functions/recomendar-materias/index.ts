import { createClient } from 'jsr:@supabase/supabase-js@2';

function filtrarMateriasInventadas(
  recomendacion: any,
  nombresValidos: Set<string>,
  userId: string
): any {
  if (!recomendacion.periodos || !Array.isArray(recomendacion.periodos)) {
    return recomendacion;
  }

  const periodosFiltrados = recomendacion.periodos.map((periodo: any) => {
    if (!periodo.materias || !Array.isArray(periodo.materias)) {
      return periodo;
    }

    const materiasReales = periodo.materias.filter((materia: any) => {
      if (!nombresValidos.has(materia.nombre)) {
        console.warn(
          `[recomendar-materias] Materia inventada descartada: "${materia.nombre}" ` +
          `(usuario: ${userId})`
        );
        return false;
      }
      return true;
    });

    return { ...periodo, materias: materiasReales };
  });

  // Eliminar períodos que quedaron sin materias
  return {
    ...recomendacion,
    periodos: periodosFiltrados.filter(
      (periodo: any) => periodo.materias && periodo.materias.length > 0
    ),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

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

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Usuario no válido' }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const { data: materias, error: materiasError } = await supabase
      .from('materias_usuario')
      .select('*')
      .eq('user_id', user.id);

    if (materiasError) throw materiasError;

    const { data: preferencias, error: prefError } = await supabase
      .from('preferencias_usuario')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (prefError) throw prefError;

    const materiasPendientes = (materias || [])
      .filter((m) => m.estado !== 'aprobada')
      .map((m) => ({
        nombre: m.nombre,
        estado: m.estado || 'pendiente',
        creditos: m.creditos ?? null,
      }));

    const contexto = {
      materias: materiasPendientes,
      total_aprobadas: (materias?.length || 0) - materiasPendientes.length,
      preferencias: {
        tipo_periodo: preferencias?.tipo_periodo || 'semestral',
        min_materias: preferencias?.min_materias ?? null,
        max_materias: preferencias?.max_materias ?? null,
      },
    };

    const prompt = `Eres un asesor académico. Con base en la siguiente información de un estudiante, genera un plan de materias organizado por períodos académicos.

Materias pendientes del estudiante (JSON):
${JSON.stringify(contexto.materias, null, 2)}

Preferencias del estudiante:
- Tipo de período: ${contexto.preferencias.tipo_periodo}
- Mínimo de materias por período: ${contexto.preferencias.min_materias ?? 'sin especificar'}
- Máximo de materias por período: ${contexto.preferencias.max_materias ?? 'sin especificar'}
- Materias ya aprobadas: ${contexto.total_aprobadas}

Reglas:
- Respeta el mínimo y máximo de materias por período indicado por el estudiante.
- Prioriza materias marcadas como "cursando" en el primer período.
- Da mayor prioridad a materias con más créditos o que suelen tener prerrequisitos largos.
- Responde ÚNICAMENTE con JSON válido, sin texto adicional, con esta forma exacta:

{
  "resumen": "string breve (1-2 oraciones)",
  "periodos": [
    {
      "numero": 1,
      "materias": [
        { "nombre": "string", "creditos": number, "prioridad": "alta" | "media" | "baja", "justificacion": "string breve" }
      ]
    }
  ]
}`;

    const nombresMaterias = materiasPendientes.map((m) => m.nombre);
    const schema = {
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
                    nombre: {
                      type: 'string',
                      enum: nombresMaterias,
                    },
                    creditos: { type: 'number' },
                    prioridad: {
                      type: 'string',
                      enum: ['alta', 'media', 'baja'],
                    },
                    justificacion: { type: 'string' },
                  },
                  required: ['nombre', 'creditos', 'prioridad', 'justificacion'],
                },
              },
            },
            required: ['numero', 'materias'],
          },
        },
      },
      required: ['resumen', 'periodos'],
    };

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${Deno.env.get('GEMINI_API_KEY')}`,
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

    let recomendacion;
    try {
      recomendacion = JSON.parse(textoRespuesta);
    } catch (parseError) {
      console.error('Respuesta de Gemini no es JSON válido:', textoRespuesta);
      throw new Error('La IA devolvió un formato inválido. Intenta de nuevo.');
    }

    // Capa 2: Validación de respaldo — filtrar materias que no estén en la lista real
    const nombresValidos = new Set(materiasPendientes.map((m) => m.nombre));
    recomendacion = filtrarMateriasInventadas(recomendacion, nombresValidos, user.id);

    const { data: inserted, error: insertError } = await supabase
      .from('recomendaciones')
      .insert({
        user_id: user.id,
        resultado: recomendacion,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ recomendacion: inserted }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error) {
    console.error('Error en recomendar-materias:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});