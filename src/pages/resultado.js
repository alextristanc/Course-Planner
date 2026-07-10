import { supabase } from '../supabaseClient.js';
import { escapeHtml } from '../utils.js';

// Mapa de colores según prioridad
const PRIORIDAD_COLOR = {
  alta: { border: '#ef4444', bg: 'rgba(239,68,68,0.08)', label: 'Alta' },
  media: { border: '#f59e0b', bg: 'rgba(245,158,11,0.08)', label: 'Media' },
  baja: { border: '#22c55e', bg: 'rgba(34,197,94,0.08)', label: 'Baja' }
};

const PRIORIDADES_VALIDAS = new Set(['alta', 'media', 'baja']);

function validarPrioridad(p) {
  if (PRIORIDADES_VALIDAS.has(p)) return p;
  return 'media';
}

export function renderResultado(session) {
  const appEl = document.querySelector('#app');
  const userEmail = escapeHtml(session?.user?.email || 'Usuario');

  appEl.innerHTML = `
    <div class="user-dashboard">
      <h1>Resultado de Planificación</h1>
      <p>Usuario: <strong>${userEmail}</strong></p>
      
      <nav style="margin: 20px 0; display: flex; justify-content: center; gap: 15px;">
        <a href="#/dashboard" style="color: var(--text); text-decoration: none;">Dashboard</a>
        <a href="#/materias" style="color: var(--text); text-decoration: none;">Cargar Materias</a>
        <a href="#/resultado" style="color: var(--accent); font-weight: bold; text-decoration: none;">Resultado</a>
      </nav>

      <div id="resultado-contenido" style="margin: 30px 0; text-align: left; max-width: 800px; margin-left: auto; margin-right: auto;">
        <p id="resultado-mensaje" style="color: var(--text);">Cargando recomendación...</p>
      </div>

      <button id="btn-logout" class="auth-btn auth-btn-primary" style="max-width: 200px; margin: 20px auto 0;">
        Cerrar sesión
      </button>
    </div>
  `;

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabase.auth.signOut();
  });

  cargarRecomendacion(session);
}

async function cargarRecomendacion(session) {
  const contenedor = document.getElementById('resultado-contenido');
  const mensajeEl = document.getElementById('resultado-mensaje');

  if (!contenedor || !mensajeEl) return;

  try {
    const { data, error } = await supabase
      .from('recomendaciones')
      .select('resultado, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    // Estado: sin recomendación aún
    if (!data || !data.resultado) {
      mensajeEl.style.display = 'none';
      contenedor.innerHTML = `
        <div style="text-align: center; padding: 40px 0;">
          <p style="color: var(--text); font-size: 16px; margin-bottom: 20px;">
            Aún no tienes ninguna recomendación.
          </p>
          <p style="color: var(--text); font-size: 14px;">
            <a href="#/materias" style="color: var(--accent);">Carga tus materias</a>
            y genera una recomendación para ver los resultados aquí.
          </p>
        </div>
      `;
      return;
    }

    const resultado = data.resultado;
    const fechaGenerada = data.created_at;

    // Validar que resultado tenga la estructura esperada
    if (!resultado.resumen || !Array.isArray(resultado.periodos)) {
      throw new Error('La recomendación guardada tiene un formato inesperado.');
    }

    // Formatear fecha
    let fechaTexto = '';
    if (fechaGenerada) {
      try {
        fechaTexto = new Date(fechaGenerada).toLocaleString('es-MX', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      } catch (_) {
        fechaTexto = escapeHtml(String(fechaGenerada));
      }
    }

    const resumenEscapado = escapeHtml(resultado.resumen);
    const totalMaterias = resultado.periodos.reduce(
      (sum, p) => sum + (Array.isArray(p.materias) ? p.materias.length : 0),
      0
    );

    let periodosHTML = '';

    if (resultado.periodos.length === 0) {
      // Array vacío: mensaje informativo
      periodosHTML = `
        <div style="text-align: center; padding: 30px 0; color: var(--text);">
          <p style="font-size: 15px;">
            No se pudieron asignar materias a ningún período.
            Esto puede ocurrir si las materias pendientes no coinciden con los criterios.
            <br>
            <a href="#/materias" style="color: var(--accent);">Intenta generar una nueva recomendación.</a>
          </p>
        </div>
      `;
    } else {
      // Construir tarjetas por período
      periodosHTML = resultado.periodos.map((periodo) => {
        const numPeriodo = escapeHtml(String(periodo.numero));
        const materias = Array.isArray(periodo.materias) ? periodo.materias : [];

        if (materias.length === 0) return '';

        const materiasCards = materias.map((materia) => {
          const nombre = escapeHtml(String(materia.nombre || ''));
          const creditos = materia.creditos !== null && materia.creditos !== undefined
            ? escapeHtml(String(materia.creditos))
            : '—';
          const justificacion = escapeHtml(String(materia.justificacion || ''));
          const prioridadRaw = materia.prioridad || 'media';
          const prioridad = validarPrioridad(prioridadRaw);
          const colores = PRIORIDAD_COLOR[prioridad];

          return `
            <div style="
              border-left: 4px solid ${colores.border};
              background: ${colores.bg};
              padding: 14px 16px;
              border-radius: 0 8px 8px 0;
              margin-bottom: 12px;
            ">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <strong style="color: var(--text-h); font-size: 16px;">${nombre}</strong>
                <span style="
                  display: inline-block;
                  background: ${colores.border};
                  color: #fff;
                  font-size: 11px;
                  font-weight: 600;
                  text-transform: uppercase;
                  padding: 2px 8px;
                  border-radius: 4px;
                  letter-spacing: 0.5px;
                ">${colores.label}</span>
              </div>
              <div style="font-size: 13px; color: var(--text); margin-bottom: 4px;">
                Créditos: <strong style="color: var(--text-h);">${creditos}</strong>
              </div>
              <div style="font-size: 13px; color: var(--text); font-style: italic;">
                ${justificacion}
              </div>
            </div>
          `;
        }).join('');

        return `
          <div style="margin-bottom: 32px;">
            <h2 style="
              font-size: 20px;
              font-weight: 500;
              color: var(--text-h);
              padding-bottom: 8px;
              border-bottom: 2px solid var(--border);
              margin-bottom: 16px;
            ">
              Período ${numPeriodo}
            </h2>
            ${materiasCards}
          </div>
        `;
      }).join('');
    }

    // Renderizar todo
    mensajeEl.style.display = 'none';
    contenedor.innerHTML = `
      <div style="margin-bottom: 24px;">
        <p style="font-size: 15px; color: var(--text); line-height: 1.5; margin-bottom: 8px;">
          ${resumenEscapado}
        </p>
        ${fechaTexto ? `<p style="font-size: 13px; color: var(--text);">
          Generada el: <strong>${escapeHtml(fechaTexto)}</strong>
        </p>` : ''}
        <p style="font-size: 13px; color: var(--text); margin-top: 4px;">
          Total de materias planificadas: <strong>${totalMaterias}</strong>
        </p>
      </div>
      ${periodosHTML}
    `;

  } catch (error) {
    console.error('Error al cargar recomendación:', error.message);
    if (mensajeEl) {
      mensajeEl.style.display = 'none';
    }
    contenedor.innerHTML = `
      <div style="text-align: center; padding: 40px 0;">
        <p style="color: #ef4444; font-size: 15px; margin-bottom: 16px;">
          Error al cargar la recomendación: ${escapeHtml(error.message)}
        </p>
        <button id="btn-reintentar" class="auth-btn auth-btn-primary" style="max-width: 200px; margin: 0 auto;">
          Reintentar
        </button>
      </div>
    `;

    const btnReintentar = document.getElementById('btn-reintentar');
    if (btnReintentar) {
      btnReintentar.addEventListener('click', () => cargarRecomendacion(session));
    }
  }
}