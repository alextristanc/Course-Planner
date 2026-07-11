import { supabase } from '../supabaseClient.js';
import {
  escapeHtml,
  formatearHorario,
  renderNav,
  showPageMessage,
  uploadDocumento,
  callEdgeFunction
} from '../utils.js';

let currentRenderId = 0;
let grupos = [];
let prioridades = {}; // oferta_id -> prioridad
let horariosEditados = {}; // oferta_id -> horario[] (cambios pendientes)

const DIAS = [
  { value: 'lun', label: 'Lunes' },
  { value: 'mar', label: 'Martes' },
  { value: 'mie', label: 'Miércoles' },
  { value: 'jue', label: 'Jueves' },
  { value: 'vie', label: 'Viernes' },
  { value: 'sab', label: 'Sábado' },
  { value: 'dom', label: 'Domingo' }
];

export function renderOferta(session) {
  const renderId = ++currentRenderId;
  const appEl = document.querySelector('#app');
  const userEmail = escapeHtml(session?.user?.email || 'Usuario');

  appEl.innerHTML = `
    <div class="user-dashboard page-wide">
      <h1>Oferta de Materias</h1>
      <p>Usuario: <strong>${userEmail}</strong></p>
      ${renderNav('#/oferta')}

      <div id="auth-error" class="auth-error" style="max-width: 1000px; margin: 10px auto;"></div>
      <div id="auth-success" class="auth-success" style="max-width: 1000px; margin: 10px auto;"></div>

      <div class="card-section" style="max-width: 1000px; margin: 0 auto; text-align: left;">
        <h2>1. Cargar oferta del periodo</h2>
        <p class="hint-text">Sube el documento de oferta académica (PDF, imagen, TXT, CSV o XLSX). Se extraerán todos los grupos sin filtrar conflictos.</p>
        <div class="upload-row">
          <input type="file" id="oferta-file" accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.xlsx,application/pdf,image/*,text/plain,text/csv" />
          <button type="button" id="btn-extraer-oferta" class="auth-btn auth-btn-primary" style="flex: 0 0 auto; min-width: 160px;">
            Extraer oferta
          </button>
        </div>
        <p id="extract-status" class="hint-text" style="margin-top: 8px;"></p>
      </div>

      <div class="card-section" style="max-width: 1000px; margin: 20px auto 0; text-align: left;">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
          <h2 style="margin: 0;">2. Catálogo y prioridades</h2>
          <div style="display: flex; gap: 8px; flex-wrap: wrap;">
            <button type="button" id="btn-save-horarios" class="auth-btn auth-btn-secondary" style="flex: 0 0 auto; min-width: 160px;">
              Guardar horarios
            </button>
            <button type="button" id="btn-save-prioridades" class="auth-btn auth-btn-primary" style="flex: 0 0 auto; min-width: 180px;">
              Guardar prioridades
            </button>
          </div>
        </div>
        <p class="hint-text">Asigna prioridad alta/media/baja a los grupos que prefieras. También puedes editar los horarios directamente.</p>
        <div id="oferta-table-wrap" class="table-wrap">
          <p id="loading-message">Cargando oferta...</p>
        </div>
        <div style="display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap;">
          <a href="#/plan" class="auth-btn auth-btn-secondary" style="flex: 1; min-width: 160px; text-decoration: none; display: flex; align-items: center; justify-content: center;">
            ← Plan
          </a>
          <a href="#/parametros" class="auth-btn auth-btn-secondary" style="flex: 1; min-width: 160px; text-decoration: none; display: flex; align-items: center; justify-content: center;">
            Continuar a Parámetros →
          </a>
        </div>
      </div>

      <button id="btn-logout" class="auth-btn auth-btn-primary" style="max-width: 200px; margin: 28px auto 0;">
        Cerrar sesión
      </button>
    </div>
  `;

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabase.auth.signOut();
  });

  document.getElementById('btn-extraer-oferta').addEventListener('click', () => handleExtraer(session));
  document.getElementById('btn-save-prioridades').addEventListener('click', () => handleGuardarPrioridades(session));
  document.getElementById('btn-save-horarios').addEventListener('click', () => handleGuardarHorarios(session));

  cargarOferta(session, renderId);
}

async function cargarOferta(session, renderId) {
  const wrap = document.getElementById('oferta-table-wrap');
  if (!session?.user) {
    wrap.innerHTML = '<p class="hint-text">No hay sesión activa.</p>';
    return;
  }

  try {
    const { data: ofertaData, error: ofertaError } = await supabase
      .from('oferta_materias')
      .select('*')
      .eq('user_id', session.user.id)
      .order('materia');

    if (renderId !== currentRenderId) return;
    if (ofertaError) throw ofertaError;

    const { data: prioData, error: prioError } = await supabase
      .from('prioridades_grupos')
      .select('*')
      .eq('user_id', session.user.id);

    if (renderId !== currentRenderId) return;
    if (prioError) throw prioError;

    grupos = ofertaData || [];
    prioridades = {};
    horariosEditados = {};
    for (const p of prioData || []) {
      prioridades[p.oferta_materia_id] = p.prioridad || 'media';
    }

    renderTablaOferta();
  } catch (err) {
    if (renderId !== currentRenderId) return;
    showPageMessage('error', err.message || 'Error al cargar oferta');
    wrap.innerHTML = `<p style="color:#ef4444;">${escapeHtml(err.message)}</p>`;
  }
}

function renderBloquesHorario(grupoId, horario) {
  const bloques = Array.isArray(horario) ? horario : [];
  if (bloques.length === 0) {
    return `<span class="hint-text" style="font-style:italic;">Sin horario</span>`;
  }
  return bloques
    .map((b, idx) => {
      const diaLabel = DIAS.find((d) => d.value === b.dia)?.label || b.dia || '?';
      return `<span class="horario-bloque" data-grupo="${escapeHtml(grupoId)}" data-idx="${idx}">
        <span class="horario-bloque-texto">${escapeHtml(diaLabel)} ${escapeHtml(b.hora_inicio || '?')}-${escapeHtml(b.hora_fin || '?')}</span>
        <button type="button" class="btn-remove-bloque" data-grupo="${escapeHtml(grupoId)}" data-idx="${idx}" title="Quitar bloque">&times;</button>
      </span>`;
    })
    .join('');
}

function renderEditorHorarioInline(grupoId) {
  const diasOptions = DIAS
    .map((d) => `<option value="${d.value}">${d.label}</option>`)
    .join('');
  return `
    <div class="horario-editor-inline" data-grupo="${escapeHtml(grupoId)}">
      <div class="horario-bloques-lista" data-grupo="${escapeHtml(grupoId)}"></div>
      <div class="horario-add-form">
        <select class="auth-input horario-dia" style="min-width:90px; width:auto;">
          ${diasOptions}
        </select>
        <input type="time" class="auth-input horario-inicio" value="07:00" style="width:100px; flex:0 0 auto;" />
        <input type="time" class="auth-input horario-fin" value="08:00" style="width:100px; flex:0 0 auto;" />
        <button type="button" class="auth-btn auth-btn-secondary btn-add-bloque" data-grupo="${escapeHtml(grupoId)}" style="flex:0 0 auto; padding:6px 10px; font-size:13px;">+</button>
      </div>
    </div>
  `;
}

function renderTablaOferta() {
  const wrap = document.getElementById('oferta-table-wrap');
  if (!wrap) return;

  if (grupos.length === 0) {
    wrap.innerHTML = `
      <div style="text-align:center; padding: 24px 0;">
        <p class="hint-text">Aún no hay oferta cargada. Sube un documento para extraer los grupos del periodo.</p>
      </div>
    `;
    return;
  }

  const rows = grupos
    .map((g) => {
      const prio = prioridades[g.id] || 'media';
      const horarioActual = horariosEditados[g.id] !== undefined ? horariosEditados[g.id] : (g.horario || []);
      return `
        <tr data-id="${escapeHtml(g.id)}">
          <td><strong>${escapeHtml(g.materia || '')}</strong></td>
          <td>${escapeHtml(g.profesor || '—')}</td>
          <td>${escapeHtml(g.identificador || '—')}</td>
          <td class="horario-cell" data-grupo="${escapeHtml(g.id)}">
            <div class="horario-bloques-container" data-grupo="${escapeHtml(g.id)}">
              ${renderBloquesHorario(g.id, horarioActual)}
            </div>
            ${renderEditorHorarioInline(g.id)}
          </td>
          <td>
            <select class="auth-input prio-select" data-id="${escapeHtml(g.id)}">
              <option value="alta" ${prio === 'alta' ? 'selected' : ''}>Alta</option>
              <option value="media" ${prio === 'media' ? 'selected' : ''}>Media</option>
              <option value="baja" ${prio === 'baja' ? 'selected' : ''}>Baja</option>
            </select>
          </td>
        </tr>
      `;
    })
    .join('');

  wrap.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Materia</th>
          <th>Profesor</th>
          <th>Grupo</th>
          <th style="min-width:280px;">Horario</th>
          <th style="width:120px;">Prioridad</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="hint-text" style="margin-top:8px;">Total: <strong>${grupos.length}</strong> grupos en la oferta</p>
  `;

  // Event listeners para prioridades
  wrap.querySelectorAll('.prio-select').forEach((sel) => {
    sel.addEventListener('change', () => {
      prioridades[sel.dataset.id] = sel.value;
    });
  });

  // Event listeners para botones de quitar bloque (usamos delegación)
  wrap.querySelectorAll('.btn-remove-bloque').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const grupoId = btn.dataset.grupo;
      const idx = Number(btn.dataset.idx);
      eliminarBloque(grupoId, idx);
    });
  });

  // Event listeners para botones de agregar bloque
  wrap.querySelectorAll('.btn-add-bloque').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const grupoId = btn.dataset.grupo;
      agregarBloque(grupoId, btn);
    });
  });
}

function obtenerHorarioActual(grupoId) {
  if (horariosEditados[grupoId] !== undefined) {
    return horariosEditados[grupoId];
  }
  const grupo = grupos.find((g) => g.id === grupoId);
  return grupo ? (grupo.horario || []) : [];
}

function actualizarVistaBloques(grupoId) {
  const contenedor = document.querySelector(`.horario-bloques-container[data-grupo="${grupoId}"]`);
  if (!contenedor) return;
  const horario = obtenerHorarioActual(grupoId);
  contenedor.innerHTML = renderBloquesHorario(grupoId, horario);

  // Re-asignar eventos a los botones de quitar
  contenedor.querySelectorAll('.btn-remove-bloque').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const gId = btn.dataset.grupo;
      const idx = Number(btn.dataset.idx);
      eliminarBloque(gId, idx);
    });
  });
}

function eliminarBloque(grupoId, idx) {
  const horario = obtenerHorarioActual(grupoId);
  if (idx < 0 || idx >= horario.length) return;
  horario.splice(idx, 1);
  horariosEditados[grupoId] = horario;
  actualizarVistaBloques(grupoId);
}

function agregarBloque(grupoId, btn) {
  const editor = btn.closest('.horario-editor-inline');
  if (!editor) return;

  const diaSelect = editor.querySelector('.horario-dia');
  const inicioInput = editor.querySelector('.horario-inicio');
  const finInput = editor.querySelector('.horario-fin');

  const dia = diaSelect?.value;
  const horaInicio = inicioInput?.value;
  const horaFin = finInput?.value;

  if (!dia || !horaInicio || !horaFin) {
    showPageMessage('error', 'Completa día, hora inicio y hora fin para agregar el bloque.');
    return;
  }

  if (horaInicio >= horaFin) {
    showPageMessage('error', 'La hora de inicio debe ser menor a la hora de fin.');
    return;
  }

  const horario = obtenerHorarioActual(grupoId);
  horario.push({ dia, hora_inicio: horaInicio, hora_fin: horaFin });
  horariosEditados[grupoId] = horario;
  showPageMessage('clear');
  actualizarVistaBloques(grupoId);
}

async function handleGuardarHorarios(session) {
  showPageMessage('clear');
  const idsModificados = Object.keys(horariosEditados);
  if (idsModificados.length === 0) {
    showPageMessage('error', 'No hay cambios de horario pendientes por guardar.');
    return;
  }

  const btn = document.getElementById('btn-save-horarios');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    let errores = 0;
    for (const id of idsModificados) {
      const horario = horariosEditados[id];
      const { error } = await supabase
        .from('oferta_materias')
        .update({ horario })
        .eq('id', id)
        .eq('user_id', session.user.id);

      if (error) {
        console.error(`Error al guardar horario de ${id}:`, error);
        errores++;
      }
    }

    if (errores === 0) {
      // Actualizar grupos locales con los horarios guardados
      for (const id of idsModificados) {
        const grupo = grupos.find((g) => g.id === id);
        if (grupo) {
          grupo.horario = horariosEditados[id];
        }
      }
      horariosEditados = {};
      showPageMessage('success', `Horarios guardados correctamente (${idsModificados.length} grupo(s)).`);
    } else {
      showPageMessage('error', `Se guardaron ${idsModificados.length - errores} de ${idsModificados.length} grupos. Revisa los errores.`);
    }
  } catch (err) {
    console.error(err);
    showPageMessage('error', err.message || 'Error al guardar horarios');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar horarios';
  }
}

async function handleExtraer(session) {
  showPageMessage('clear');
  const fileInput = document.getElementById('oferta-file');
  const statusEl = document.getElementById('extract-status');
  const btn = document.getElementById('btn-extraer-oferta');
  const file = fileInput?.files?.[0];

  if (!file) {
    showPageMessage('error', 'Selecciona un archivo primero.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Procesando...';
  statusEl.textContent = 'Subiendo documento y extrayendo oferta...';

  try {
    const {
      data: { session: currentSession }
    } = await supabase.auth.getSession();
    if (!currentSession?.access_token) {
      throw new Error('Tu sesión ha expirado. Por favor, reinicia sesión.');
    }

    const path = await uploadDocumento(supabase, session.user.id, file, 'oferta');
    statusEl.textContent = 'Documento subido. Analizando con IA...';

    const result = await callEdgeFunction('extraer-oferta', currentSession.access_token, {
      file_path: path,
      mime_type: file.type || null,
      replace_existing: true
    });

    grupos = result.grupos || [];
    prioridades = {};
    horariosEditados = {};
    for (const g of grupos) {
      prioridades[g.id] = 'media';
    }

    renderTablaOferta();
    showPageMessage('success', `Se extrajeron ${result.total || grupos.length} grupos. Asigna prioridades y guarda.`);
    statusEl.textContent = `Extracción completada (${result.total || grupos.length} grupos).`;
  } catch (err) {
    console.error(err);
    showPageMessage('error', err.message || 'Error al extraer la oferta');
    statusEl.textContent = '';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Extraer oferta';
  }
}

async function handleGuardarPrioridades(session) {
  showPageMessage('clear');
  const btn = document.getElementById('btn-save-prioridades');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    if (grupos.length === 0) {
      throw new Error('No hay grupos para guardar prioridades.');
    }

    // Borrar prioridades previas del usuario e insertar nuevas
    const { error: delError } = await supabase
      .from('prioridades_grupos')
      .delete()
      .eq('user_id', session.user.id);

    if (delError) throw delError;

    const rows = grupos.map((g) => ({
      user_id: session.user.id,
      oferta_materia_id: g.id,
      prioridad: prioridades[g.id] || 'media'
    }));

    const { error: insertError } = await supabase.from('prioridades_grupos').insert(rows);
    if (insertError) throw insertError;

    showPageMessage('success', 'Prioridades guardadas con éxito.');
  } catch (err) {
    console.error(err);
    showPageMessage('error', err.message || 'Error al guardar prioridades');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar prioridades';
  }
}