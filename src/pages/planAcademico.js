import { supabase } from '../supabaseClient.js';
import {
  escapeHtml,
  normalizarEstado,
  renderNav,
  showPageMessage,
  uploadDocumento,
  callEdgeFunction
} from '../utils.js';

let currentRenderId = 0;
let materiasEditables = [];

export function renderPlanAcademico(session) {
  const renderId = ++currentRenderId;
  const appEl = document.querySelector('#app');
  const userEmail = escapeHtml(session?.user?.email || 'Usuario');

  appEl.innerHTML = `
    <div class="user-dashboard page-wide">
      <h1>Plan Académico</h1>
      <p>Usuario: <strong>${userEmail}</strong></p>
      ${renderNav('#/plan')}

      <div id="auth-error" class="auth-error" style="max-width: 900px; margin: 10px auto;"></div>
      <div id="auth-success" class="auth-success" style="max-width: 900px; margin: 10px auto;"></div>

      <div class="card-section" style="max-width: 900px; margin: 0 auto; text-align: left;">
        <h2>1. Cargar documento</h2>
        <p class="hint-text">Sube tu plan de estudios, kardex o historial (PDF, imagen, TXT, CSV o XLSX). La IA extraerá las materias automáticamente.</p>
        <div class="upload-row">
          <input type="file" id="plan-file" accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.xlsx,application/pdf,image/*,text/plain,text/csv" />
          <button type="button" id="btn-extraer" class="auth-btn auth-btn-primary" style="flex: 0 0 auto; min-width: 160px;">
            Extraer con IA
          </button>
        </div>
        <p id="extract-status" class="hint-text" style="margin-top: 8px;"></p>
      </div>

      <div class="card-section" style="max-width: 900px; margin: 20px auto 0; text-align: left;">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;">
          <h2 style="margin: 0;">2. Revisar y editar materias</h2>
          <button type="button" id="btn-add-row" class="auth-btn auth-btn-secondary" style="flex: 0 0 auto;">
            + Agregar materia
          </button>
        </div>
        <p class="hint-text">Corrige errores de la extracción antes de guardar. También puedes capturar todo manualmente.</p>
        <div id="materias-table-wrap" class="table-wrap">
          <p id="loading-message">Cargando materias guardadas...</p>
        </div>
        <div style="display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap;">
          <button type="button" id="btn-save-plan" class="auth-btn auth-btn-primary" style="flex: 1; min-width: 180px;">
            Guardar plan académico
          </button>
          <a href="#/oferta" class="auth-btn auth-btn-secondary" style="flex: 1; min-width: 180px; text-decoration: none; display: flex; align-items: center; justify-content: center;">
            Continuar a Oferta →
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

  document.getElementById('btn-extraer').addEventListener('click', () => handleExtraer(session));
  document.getElementById('btn-add-row').addEventListener('click', () => {
    materiasEditables.push({ nombre: '', estado: 'pendiente', creditos: null });
    renderTablaMaterias();
  });
  document.getElementById('btn-save-plan').addEventListener('click', () => handleGuardar(session));

  cargarMateriasGuardadas(session, renderId);
}

async function cargarMateriasGuardadas(session, renderId) {
  const wrap = document.getElementById('materias-table-wrap');
  if (!session?.user) {
    wrap.innerHTML = '<p class="hint-text">No hay sesión activa.</p>';
    return;
  }

  try {
    const { data, error } = await supabase
      .from('materias_usuario')
      .select('*')
      .eq('user_id', session.user.id)
      .order('nombre');

    if (renderId !== currentRenderId) return;
    if (error) throw error;

    materiasEditables = (data || []).map((m) => ({
      nombre: m.nombre || '',
      estado: m.estado || 'pendiente',
      creditos: m.creditos ?? null
    }));

    if (materiasEditables.length === 0) {
      materiasEditables = [{ nombre: '', estado: 'pendiente', creditos: null }];
    }

    renderTablaMaterias();
  } catch (err) {
    if (renderId !== currentRenderId) return;
    showPageMessage('error', err.message || 'Error al cargar materias');
    wrap.innerHTML = `<p style="color:#ef4444;">${escapeHtml(err.message)}</p>`;
  }
}

function renderTablaMaterias() {
  const wrap = document.getElementById('materias-table-wrap');
  if (!wrap) return;

  if (materiasEditables.length === 0) {
    wrap.innerHTML = '<p class="hint-text">No hay materias. Agrega una o extrae desde un documento.</p>';
    return;
  }

  const rows = materiasEditables
    .map((m, i) => {
      const nombre = escapeHtml(m.nombre || '');
      const estado = m.estado || 'pendiente';
      const creditos = m.creditos !== null && m.creditos !== undefined ? m.creditos : '';
      return `
        <tr data-index="${i}">
          <td>
            <input type="text" class="auth-input mat-nombre" value="${nombre}" placeholder="Nombre de la materia" />
          </td>
          <td>
            <select class="auth-input mat-estado">
              <option value="pendiente" ${estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
              <option value="cursando" ${estado === 'cursando' ? 'selected' : ''}>Cursando</option>
              <option value="aprobada" ${estado === 'aprobada' ? 'selected' : ''}>Aprobada</option>
            </select>
          </td>
          <td>
            <input type="number" class="auth-input mat-creditos" min="0" step="0.5" value="${creditos}" placeholder="—" />
          </td>
          <td style="text-align:center;">
            <button type="button" class="btn-icon btn-remove-row" title="Eliminar">✕</button>
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
          <th style="width:140px;">Estado</th>
          <th style="width:100px;">Créditos</th>
          <th style="width:50px;"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="hint-text" style="margin-top:8px;">Total: <strong>${materiasEditables.length}</strong> materias</p>
  `;

  wrap.querySelectorAll('tbody tr').forEach((tr) => {
    const idx = Number(tr.dataset.index);
    const nombreInput = tr.querySelector('.mat-nombre');
    const estadoSelect = tr.querySelector('.mat-estado');
    const creditosInput = tr.querySelector('.mat-creditos');
    const removeBtn = tr.querySelector('.btn-remove-row');

    nombreInput.addEventListener('input', () => {
      materiasEditables[idx].nombre = nombreInput.value;
    });
    estadoSelect.addEventListener('change', () => {
      materiasEditables[idx].estado = estadoSelect.value;
    });
    creditosInput.addEventListener('input', () => {
      const v = creditosInput.value.trim();
      materiasEditables[idx].creditos = v === '' ? null : Number(v);
    });
    removeBtn.addEventListener('click', () => {
      materiasEditables.splice(idx, 1);
      renderTablaMaterias();
    });
  });
}

async function handleExtraer(session) {
  showPageMessage('clear');
  const fileInput = document.getElementById('plan-file');
  const statusEl = document.getElementById('extract-status');
  const btn = document.getElementById('btn-extraer');
  const file = fileInput?.files?.[0];

  if (!file) {
    showPageMessage('error', 'Selecciona un archivo primero.');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Procesando...';
  statusEl.textContent = 'Subiendo documento y extrayendo con IA...';

  try {
    const {
      data: { session: currentSession }
    } = await supabase.auth.getSession();
    if (!currentSession?.access_token) {
      throw new Error('Tu sesión ha expirado. Por favor, reinicia sesión.');
    }

    const path = await uploadDocumento(supabase, session.user.id, file, 'plan');
    statusEl.textContent = 'Documento subido. Analizando con IA...';

    const result = await callEdgeFunction('extraer-documento', currentSession.access_token, {
      file_path: path,
      mime_type: file.type || null
    });

    materiasEditables = (result.materias || []).map((m) => ({
      nombre: m.nombre || '',
      estado: normalizarEstado(m.estado) || 'pendiente',
      creditos: m.creditos ?? null
    }));

    if (materiasEditables.length === 0) {
      materiasEditables = [{ nombre: '', estado: 'pendiente', creditos: null }];
    }

    renderTablaMaterias();
    showPageMessage(
      'success',
      `Se extrajeron ${result.total || materiasEditables.length} materias. Revísalas y guarda el plan.`
    );
    statusEl.textContent = `Extracción completada (${result.total || materiasEditables.length} materias).`;
  } catch (err) {
    console.error(err);
    showPageMessage('error', err.message || 'Error al extraer el documento');
    statusEl.textContent = '';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Extraer con IA';
  }
}

async function handleGuardar(session) {
  showPageMessage('clear');
  const btn = document.getElementById('btn-save-plan');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    const parsed = [];
    for (let i = 0; i < materiasEditables.length; i++) {
      const m = materiasEditables[i];
      const nombre = (m.nombre || '').trim();
      if (!nombre) continue;

      let creditos = null;
      if (m.creditos !== null && m.creditos !== undefined && m.creditos !== '') {
        const n = Number(m.creditos);
        if (Number.isNaN(n)) {
          throw new Error(`Créditos inválidos en la materia "${nombre}".`);
        }
        creditos = n;
      }

      parsed.push({
        user_id: session.user.id,
        nombre,
        estado: normalizarEstado(m.estado) || 'pendiente',
        creditos,
        metadata: { source: 'plan_academico' }
      });
    }

    if (parsed.length === 0) {
      throw new Error('Debes tener al menos una materia con nombre.');
    }

    const { error: deleteError } = await supabase
      .from('materias_usuario')
      .delete()
      .eq('user_id', session.user.id);

    if (deleteError) throw deleteError;

    const { error: insertError } = await supabase.from('materias_usuario').insert(parsed);
    if (insertError) throw insertError;

    materiasEditables = parsed.map((m) => ({
      nombre: m.nombre,
      estado: m.estado,
      creditos: m.creditos
    }));
    renderTablaMaterias();

    showPageMessage('success', `Plan académico guardado (${parsed.length} materias).`);
  } catch (err) {
    console.error(err);
    showPageMessage('error', err.message || 'Error al guardar');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar plan académico';
  }
}
