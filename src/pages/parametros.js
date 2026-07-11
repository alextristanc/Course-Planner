import { supabase } from '../supabaseClient.js';
import {
  escapeHtml,
  formatearHorario,
  renderNav,
  showPageMessage,
  callEdgeFunction
} from '../utils.js';

let currentRenderId = 0;
let horariosNoDisponibles = [];

export function renderParametros(session) {
  const renderId = ++currentRenderId;
  const appEl = document.querySelector('#app');
  const userEmail = escapeHtml(session?.user?.email || 'Usuario');

  appEl.innerHTML = `
    <div class="user-dashboard page-wide">
      <h1>Parámetros de Planificación</h1>
      <p>Usuario: <strong>${userEmail}</strong></p>
      ${renderNav('#/parametros')}

      <div id="auth-error" class="auth-error" style="max-width: 800px; margin: 10px auto;"></div>
      <div id="auth-success" class="auth-success" style="max-width: 800px; margin: 10px auto;"></div>

      <div id="param-form-container" style="max-width: 800px; margin: 0 auto;">
        <p id="loading-message">Cargando preferencias...</p>
      </div>

      <button id="btn-logout" class="auth-btn auth-btn-primary" style="max-width: 200px; margin: 28px auto 0;">
        Cerrar sesión
      </button>
    </div>
  `;

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabase.auth.signOut();
  });

  cargarPreferencias(session, renderId);
}

async function cargarPreferencias(session, renderId) {
  const container = document.getElementById('param-form-container');
  if (!session?.user) {
    container.innerHTML = '<p class="hint-text">No hay sesión activa.</p>';
    return;
  }

  try {
    const { data: pref, error } = await supabase
      .from('preferencias_usuario')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (renderId !== currentRenderId) return;
    if (error) throw error;

    const tipoPeriodo = pref?.tipo_periodo || 'semestral';
    const minMaterias = pref?.min_materias ?? '';
    const maxMaterias = pref?.max_materias ?? '';
    const semestreActual = pref?.semestre_actual ?? '';
    const limiteCreditos = pref?.limite_creditos ?? '';
    horariosNoDisponibles = Array.isArray(pref?.horarios_no_disponibles)
      ? [...pref.horarios_no_disponibles]
      : [];

    container.innerHTML = `
      <form id="param-form" class="card-section" style="text-align: left; display: flex; flex-direction: column; gap: 18px;">
        <h2>Restricciones y preferencias</h2>
        <p class="hint-text">Estos parámetros se usarán al generar la recomendación de inscripción.</p>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          <div class="field-group">
            <label for="tipo-periodo">Tipo de período</label>
            <select id="tipo-periodo" class="auth-input">
              <option value="semestral" ${tipoPeriodo === 'semestral' ? 'selected' : ''}>Semestral</option>
              <option value="cuatrimestral" ${tipoPeriodo === 'cuatrimestral' ? 'selected' : ''}>Cuatrimestral</option>
            </select>
          </div>
          <div class="field-group">
            <label for="semestre-actual">Semestre / periodo actual</label>
            <input type="number" id="semestre-actual" class="auth-input" min="1" value="${escapeHtml(String(semestreActual))}" placeholder="Ej. 5" />
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px;">
          <div class="field-group">
            <label for="min-materias">Mín. materias</label>
            <input type="number" id="min-materias" class="auth-input" min="1" value="${escapeHtml(String(minMaterias))}" />
          </div>
          <div class="field-group">
            <label for="max-materias">Máx. materias</label>
            <input type="number" id="max-materias" class="auth-input" min="1" value="${escapeHtml(String(maxMaterias))}" />
          </div>
          <div class="field-group">
            <label for="limite-creditos">Límite de créditos</label>
            <input type="number" id="limite-creditos" class="auth-input" min="1" step="0.5" value="${escapeHtml(String(limiteCreditos))}" />
          </div>
        </div>

        <div>
          <h3 style="margin: 8px 0; color: var(--text-h); font-size: 16px;">Horarios no disponibles</h3>
          <p class="hint-text">Bloques en los que NO puedes tomar clase. La IA evitará grupos que choquen con estos horarios.</p>
          <div id="bloques-list"></div>
          <div class="bloque-form">
            <select id="bloque-dia" class="auth-input">
              <option value="lun">Lunes</option>
              <option value="mar">Martes</option>
              <option value="mie">Miércoles</option>
              <option value="jue">Jueves</option>
              <option value="vie">Viernes</option>
              <option value="sab">Sábado</option>
              <option value="dom">Domingo</option>
            </select>
            <input type="time" id="bloque-inicio" class="auth-input" value="07:00" />
            <input type="time" id="bloque-fin" class="auth-input" value="09:00" />
            <button type="button" id="btn-add-bloque" class="auth-btn auth-btn-secondary">Agregar</button>
          </div>
        </div>

        <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-top: 8px;">
          <button type="submit" id="btn-save-params" class="auth-btn auth-btn-primary" style="flex: 1; min-width: 180px;">
            Guardar parámetros
          </button>
          <button type="button" id="btn-generate" class="auth-btn auth-btn-primary" style="flex: 1; min-width: 180px; display: none;">
            Generar recomendación
          </button>
        </div>

        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          <a href="#/oferta" class="auth-btn auth-btn-secondary" style="flex: 1; min-width: 140px; text-decoration: none; display: flex; align-items: center; justify-content: center;">
            ← Oferta
          </a>
          <a href="#/resultado" class="auth-btn auth-btn-secondary" style="flex: 1; min-width: 140px; text-decoration: none; display: flex; align-items: center; justify-content: center;">
            Ver resultado →
          </a>
        </div>
      </form>
    `;

    renderBloques();

    document.getElementById('param-form').addEventListener('submit', (e) => handleSave(e, session));
    document.getElementById('btn-add-bloque').addEventListener('click', handleAddBloque);
    document.getElementById('btn-generate').addEventListener('click', handleGenerate);

    // Si ya hay preferencias, mostrar botón de generar
    if (pref) {
      const btnGen = document.getElementById('btn-generate');
      if (btnGen) btnGen.style.display = 'block';
    }
  } catch (err) {
    if (renderId !== currentRenderId) return;
    showPageMessage('error', err.message || 'Error al cargar preferencias');
    container.innerHTML = `<p style="color:#ef4444;">${escapeHtml(err.message)}</p>`;
  }
}

function renderBloques() {
  const list = document.getElementById('bloques-list');
  if (!list) return;

  if (horariosNoDisponibles.length === 0) {
    list.innerHTML = '<p class="hint-text" style="margin: 8px 0;">Sin bloques restringidos.</p>';
    return;
  }

  list.innerHTML = `
    <ul class="bloque-list">
      ${horariosNoDisponibles
        .map(
          (b, i) => `
        <li>
          <span>${escapeHtml(formatearHorario([b]))}</span>
          <button type="button" class="btn-icon btn-remove-bloque" data-index="${i}" title="Eliminar">✕</button>
        </li>
      `
        )
        .join('')}
    </ul>
  `;

  list.querySelectorAll('.btn-remove-bloque').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.index);
      horariosNoDisponibles.splice(idx, 1);
      renderBloques();
      hideGenerate();
    });
  });
}

function handleAddBloque() {
  const dia = document.getElementById('bloque-dia').value;
  const inicio = document.getElementById('bloque-inicio').value;
  const fin = document.getElementById('bloque-fin').value;

  if (!inicio || !fin) {
    showPageMessage('error', 'Indica hora de inicio y fin.');
    return;
  }
  if (inicio >= fin) {
    showPageMessage('error', 'La hora de inicio debe ser menor que la de fin.');
    return;
  }

  horariosNoDisponibles.push({
    dia,
    hora_inicio: inicio,
    hora_fin: fin
  });
  renderBloques();
  hideGenerate();
  showPageMessage('clear');
}

function hideGenerate() {
  const btn = document.getElementById('btn-generate');
  if (btn) {
    btn.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Generar recomendación';
  }
}

async function handleSave(e, session) {
  e.preventDefault();
  showPageMessage('clear');
  const btn = document.getElementById('btn-save-params');
  btn.disabled = true;
  btn.textContent = 'Guardando...';

  try {
    const tipoPeriodo = document.getElementById('tipo-periodo').value;
    const minVal = document.getElementById('min-materias').value;
    const maxVal = document.getElementById('max-materias').value;
    const semVal = document.getElementById('semestre-actual').value;
    const limVal = document.getElementById('limite-creditos').value;

    const minMaterias = minVal ? parseInt(minVal, 10) : null;
    const maxMaterias = maxVal ? parseInt(maxVal, 10) : null;

    if (minMaterias && maxMaterias && minMaterias > maxMaterias) {
      throw new Error('El mínimo de materias no puede ser mayor que el máximo.');
    }

    const payload = {
      user_id: session.user.id,
      tipo_periodo: tipoPeriodo,
      min_materias: minMaterias,
      max_materias: maxMaterias,
      semestre_actual: semVal ? parseInt(semVal, 10) : null,
      limite_creditos: limVal ? Number(limVal) : null,
      horarios_no_disponibles: horariosNoDisponibles,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from('preferencias_usuario')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) throw error;

    showPageMessage('success', 'Parámetros guardados. Ya puedes generar la recomendación.');
    const btnGen = document.getElementById('btn-generate');
    if (btnGen) {
      btnGen.style.display = 'block';
      btnGen.disabled = false;
    }
  } catch (err) {
    console.error(err);
    showPageMessage('error', err.message || 'Error al guardar parámetros');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar parámetros';
  }
}

async function handleGenerate() {
  const btn = document.getElementById('btn-generate');
  btn.disabled = true;
  btn.textContent = 'Generando recomendación...';
  showPageMessage('clear');

  try {
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
      throw new Error('Tu sesión ha expirado. Por favor, reinicia sesión.');
    }

    await callEdgeFunction('recomendar-materias', session.access_token, {});
    window.location.hash = '#/resultado';
  } catch (err) {
    console.error(err);
    showPageMessage('error', err.message || 'Error al generar recomendación');
    btn.disabled = false;
    btn.textContent = 'Generar recomendación';
  }
}
