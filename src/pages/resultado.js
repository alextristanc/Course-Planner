import { supabase } from '../supabaseClient.js';
import {
  escapeHtml,
  formatearHorario,
  renderNav,
  showPageMessage,
  horariosConflictan
} from '../utils.js';

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

let gruposSeleccionados = [];
let ofertaDisponible = [];
let recomendacionMeta = { resumen: '', created_at: null, modo: null, periodos: null };

export function renderResultado(session) {
  const appEl = document.querySelector('#app');
  const userEmail = escapeHtml(session?.user?.email || 'Usuario');

  appEl.innerHTML = `
    <div class="user-dashboard page-wide">
      <h1>Resultado de Planificación</h1>
      <p>Usuario: <strong>${userEmail}</strong></p>
      ${renderNav('#/resultado')}

      <div id="auth-error" class="auth-error" style="max-width: 900px; margin: 10px auto;"></div>
      <div id="auth-success" class="auth-success" style="max-width: 900px; margin: 10px auto;"></div>

      <div id="resultado-contenido" style="margin: 20px auto; text-align: left; max-width: 900px;">
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

    if (!data || !data.resultado) {
      mensajeEl.style.display = 'none';
      contenedor.innerHTML = `
        <div style="text-align: center; padding: 40px 0;">
          <p style="color: var(--text); font-size: 16px; margin-bottom: 20px;">
            Aún no tienes ninguna recomendación.
          </p>
          <p style="color: var(--text); font-size: 14px;">
            Completa el <a href="#/plan" style="color: var(--accent);">plan académico</a>,
            la <a href="#/oferta" style="color: var(--accent);">oferta</a> y los
            <a href="#/parametros" style="color: var(--accent);">parámetros</a>
            para generar una recomendación.
          </p>
        </div>
      `;
      return;
    }

    const resultado = data.resultado;
    recomendacionMeta = {
      resumen: resultado.resumen || '',
      created_at: data.created_at,
      modo: resultado.modo || (Array.isArray(resultado.grupos) && resultado.grupos.length ? 'inscripcion_grupos' : 'plan_periodos'),
      periodos: resultado.periodos || null
    };

    // Cargar oferta para poder agregar/sustituir
    const { data: oferta, error: ofertaError } = await supabase
      .from('oferta_materias')
      .select('*')
      .eq('user_id', session.user.id);

    if (ofertaError) throw ofertaError;
    ofertaDisponible = oferta || [];

    if (recomendacionMeta.modo === 'inscripcion_grupos' || Array.isArray(resultado.grupos)) {
      gruposSeleccionados = (resultado.grupos || []).map((g) => ({ ...g }));
      renderEditorGrupos(session);
    } else {
      renderPlanPeriodos(resultado, data.created_at);
    }
  } catch (error) {
    console.error('Error al cargar recomendación:', error.message);
    if (mensajeEl) mensajeEl.style.display = 'none';
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

function renderPlanPeriodos(resultado, fechaGenerada) {
  const contenedor = document.getElementById('resultado-contenido');
  const mensajeEl = document.getElementById('resultado-mensaje');
  if (mensajeEl) mensajeEl.style.display = 'none';

  if (!resultado.resumen || !Array.isArray(resultado.periodos)) {
    contenedor.innerHTML = `<p style="color:#ef4444;">Formato de recomendación inesperado.</p>`;
    return;
  }

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
      fechaTexto = String(fechaGenerada);
    }
  }

  const totalMaterias = resultado.periodos.reduce(
    (sum, p) => sum + (Array.isArray(p.materias) ? p.materias.length : 0),
    0
  );

  let periodosHTML = '';
  if (resultado.periodos.length === 0) {
    periodosHTML = `
      <div style="text-align: center; padding: 30px 0; color: var(--text);">
        <p>No se pudieron asignar materias a ningún período.
        <a href="#/parametros" style="color: var(--accent);">Genera una nueva recomendación.</a></p>
      </div>
    `;
  } else {
    periodosHTML = resultado.periodos
      .map((periodo) => {
        const materias = Array.isArray(periodo.materias) ? periodo.materias : [];
        if (materias.length === 0) return '';
        const cards = materias
          .map((materia) => {
            const prioridad = validarPrioridad(materia.prioridad || 'media');
            const colores = PRIORIDAD_COLOR[prioridad];
            return `
              <div class="result-card" style="border-left-color: ${colores.border}; background: ${colores.bg};">
                <div class="result-card-header">
                  <strong>${escapeHtml(String(materia.nombre || ''))}</strong>
                  <span class="prio-badge" style="background:${colores.border};">${colores.label}</span>
                </div>
                <div class="hint-text">Créditos: <strong>${escapeHtml(String(materia.creditos ?? '—'))}</strong></div>
                <div class="hint-text" style="font-style:italic;">${escapeHtml(String(materia.justificacion || ''))}</div>
              </div>
            `;
          })
          .join('');
        return `
          <div style="margin-bottom: 28px;">
            <h2 class="section-title">Período ${escapeHtml(String(periodo.numero))}</h2>
            ${cards}
          </div>
        `;
      })
      .join('');
  }

  contenedor.innerHTML = `
    <div class="card-section">
      <p style="margin-bottom: 8px;">${escapeHtml(resultado.resumen)}</p>
      ${fechaTexto ? `<p class="hint-text">Generada el: <strong>${escapeHtml(fechaTexto)}</strong></p>` : ''}
      <p class="hint-text">Total de materias planificadas: <strong>${totalMaterias}</strong></p>
      <p class="hint-text" style="margin-top:8px;">
        Nota: esta recomendación es un plan por períodos (sin oferta de grupos coincidente).
        Carga la <a href="#/oferta" style="color:var(--accent);">oferta del periodo</a> para obtener grupos y horarios concretos.
      </p>
    </div>
    ${periodosHTML}
  `;
}

function renderEditorGrupos(session) {
  const contenedor = document.getElementById('resultado-contenido');
  const mensajeEl = document.getElementById('resultado-mensaje');
  if (mensajeEl) mensajeEl.style.display = 'none';

  let fechaTexto = '';
  if (recomendacionMeta.created_at) {
    try {
      fechaTexto = new Date(recomendacionMeta.created_at).toLocaleString('es-MX', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (_) {
      fechaTexto = String(recomendacionMeta.created_at);
    }
  }

  const totalCreditos = gruposSeleccionados.reduce(
    (s, g) => s + (typeof g.creditos === 'number' ? g.creditos : 0),
    0
  );

  const cards = gruposSeleccionados
    .map((g, i) => {
      const prioridad = validarPrioridad(g.prioridad || 'media');
      const colores = PRIORIDAD_COLOR[prioridad];
      return `
        <div class="result-card" data-index="${i}" style="border-left-color: ${colores.border}; background: ${colores.bg};">
          <div class="result-card-header">
            <strong>${escapeHtml(g.materia || '')}</strong>
            <span class="prio-badge" style="background:${colores.border};">${colores.label}</span>
          </div>
          <div class="hint-text">Profesor: <strong>${escapeHtml(g.profesor || '—')}</strong></div>
          <div class="hint-text">Grupo: <strong>${escapeHtml(g.identificador || '—')}</strong></div>
          <div class="hint-text">Horario: <strong>${escapeHtml(formatearHorario(g.horario))}</strong></div>
          <div class="hint-text">Créditos: <strong>${escapeHtml(String(g.creditos ?? '—'))}</strong></div>
          ${g.justificacion ? `<div class="hint-text" style="font-style:italic; margin-top:4px;">${escapeHtml(g.justificacion)}</div>` : ''}
          <div style="margin-top: 10px; display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="auth-btn auth-btn-secondary btn-remove-grupo" data-index="${i}" style="flex:0 0 auto; padding:6px 12px; font-size:13px;">
              Quitar
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  // Opciones para agregar desde oferta (excluyendo ya seleccionados y conflictos)
  const idsSeleccionados = new Set(gruposSeleccionados.map((g) => g.oferta_id).filter(Boolean));
  const materiasSeleccionadas = new Set(
    gruposSeleccionados.map((g) => (g.materia || '').toLowerCase())
  );

  const opcionesAgregar = ofertaDisponible.filter((o) => {
    if (idsSeleccionados.has(o.id)) return false;
    if (materiasSeleccionadas.has((o.materia || '').toLowerCase())) return false;
    for (const sel of gruposSeleccionados) {
      if (horariosConflictan(o.horario || [], sel.horario || [])) return false;
    }
    return true;
  });

  const optionsHtml = opcionesAgregar
    .map((o) => {
      const label = `${o.materia} | ${o.profesor || 'S/P'} | ${o.identificador || '—'} | ${formatearHorario(o.horario)}`;
      return `<option value="${escapeHtml(o.id)}">${escapeHtml(label)}</option>`;
    })
    .join('');

  contenedor.innerHTML = `
    <div class="card-section">
      <p style="margin-bottom: 8px;">${escapeHtml(recomendacionMeta.resumen || 'Propuesta de inscripción')}</p>
      ${fechaTexto ? `<p class="hint-text">Generada el: <strong>${escapeHtml(fechaTexto)}</strong></p>` : ''}
      <p class="hint-text">
        Materias: <strong>${gruposSeleccionados.length}</strong> ·
        Créditos: <strong>${totalCreditos}</strong>
      </p>
      <p class="hint-text" style="margin-top:6px;">
        Puedes agregar, quitar o sustituir grupos. Solo se muestran opciones sin conflicto de horario.
      </p>
    </div>

    <div style="margin-top: 20px;">
      <h2 class="section-title">Carga recomendada</h2>
      ${
        gruposSeleccionados.length === 0
          ? '<p class="hint-text">No hay grupos en la recomendación. Agrega desde la oferta.</p>'
          : cards
      }
    </div>

    <div class="card-section" style="margin-top: 20px;">
      <h3 style="margin: 0 0 10px; color: var(--text-h); font-size: 16px;">Agregar grupo de la oferta</h3>
      <div class="upload-row">
        <select id="select-agregar" class="auth-input" ${opcionesAgregar.length === 0 ? 'disabled' : ''}>
          <option value="">${opcionesAgregar.length === 0 ? 'No hay grupos compatibles disponibles' : 'Selecciona un grupo...'}</option>
          ${optionsHtml}
        </select>
        <button type="button" id="btn-agregar-grupo" class="auth-btn auth-btn-primary" style="flex:0 0 auto; min-width:120px;" ${opcionesAgregar.length === 0 ? 'disabled' : ''}>
          Agregar
        </button>
      </div>
    </div>

    <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top: 20px;">
      <button type="button" id="btn-guardar-carga" class="auth-btn auth-btn-primary" style="flex:1; min-width:180px;">
        Guardar carga final
      </button>
      <a href="#/parametros" class="auth-btn auth-btn-secondary" style="flex:1; min-width:180px; text-decoration:none; display:flex; align-items:center; justify-content:center;">
        Regenerar desde parámetros
      </a>
    </div>
  `;

  contenedor.querySelectorAll('.btn-remove-grupo').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index);
      gruposSeleccionados.splice(idx, 1);
      renderEditorGrupos(session);
    });
  });

  const btnAgregar = document.getElementById('btn-agregar-grupo');
  if (btnAgregar) {
    btnAgregar.addEventListener('click', () => {
      const select = document.getElementById('select-agregar');
      const id = select?.value;
      if (!id) return;
      const oferta = ofertaDisponible.find((o) => o.id === id);
      if (!oferta) return;

      // Validar conflictos de nuevo
      for (const sel of gruposSeleccionados) {
        if (horariosConflictan(oferta.horario || [], sel.horario || [])) {
          showPageMessage('error', 'Ese grupo tiene conflicto de horario con la carga actual.');
          return;
        }
      }

      gruposSeleccionados.push({
        oferta_id: oferta.id,
        materia: oferta.materia,
        profesor: oferta.profesor,
        identificador: oferta.identificador,
        horario: oferta.horario || [],
        prioridad: 'media',
        justificacion: 'Agregado manualmente por el usuario',
        creditos: null
      });
      showPageMessage('clear');
      renderEditorGrupos(session);
    });
  }

  const btnGuardar = document.getElementById('btn-guardar-carga');
  if (btnGuardar) {
    btnGuardar.addEventListener('click', () => guardarCargaFinal(session));
  }
}

async function guardarCargaFinal(session) {
  showPageMessage('clear');
  const btn = document.getElementById('btn-guardar-carga');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Guardando...';
  }

  try {
    const resultado = {
      resumen: recomendacionMeta.resumen || 'Carga académica definida por el usuario.',
      modo: 'inscripcion_grupos',
      grupos: gruposSeleccionados,
      total_materias: gruposSeleccionados.length,
      total_creditos: gruposSeleccionados.reduce(
        (s, g) => s + (typeof g.creditos === 'number' ? g.creditos : 0),
        0
      ),
      editado_manualmente: true
    };

    const { error } = await supabase.from('recomendaciones').insert({
      user_id: session.user.id,
      resultado
    });

    if (error) throw error;

    recomendacionMeta.created_at = new Date().toISOString();
    showPageMessage('success', 'Carga final guardada con éxito.');
  } catch (err) {
    console.error(err);
    showPageMessage('error', err.message || 'Error al guardar la carga');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Guardar carga final';
    }
  }
}
