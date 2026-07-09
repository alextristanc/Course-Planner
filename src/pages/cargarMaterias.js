import { supabase } from '../supabaseClient.js';
import { escapeHtml, normalizarEstado } from '../utils.js';

// Mostrar errores o mensajes de éxito
function showMessage(type, text) {
  const errorEl = document.getElementById('auth-error');
  const successEl = document.getElementById('auth-success');
  
  if (!errorEl || !successEl) return;

  if (type === 'error') {
    errorEl.textContent = text;
    errorEl.style.display = 'block';
    successEl.style.display = 'none';
  } else if (type === 'success') {
    successEl.textContent = text;
    successEl.style.display = 'block';
    errorEl.style.display = 'none';
  } else {
    errorEl.style.display = 'none';
    successEl.style.display = 'none';
  }
}

export function renderCargarMaterias(session) {
  const appEl = document.querySelector('#app');
  const userEmail = escapeHtml(session?.user?.email || 'Usuario');

  appEl.innerHTML = `
    <div class="user-dashboard">
      <h1>Cargar Materias</h1>
      <p>Usuario: <strong>${userEmail}</strong></p>
      
      <nav style="margin: 20px 0; display: flex; justify-content: center; gap: 15px;">
        <a href="#/dashboard" style="color: var(--text); text-decoration: none;">Dashboard</a>
        <a href="#/materias" style="color: var(--accent); font-weight: bold; text-decoration: none;">Cargar Materias</a>
        <a href="#/resultado" style="color: var(--text); text-decoration: none;">Resultado</a>
      </nav>

      <div id="auth-error" class="auth-error" style="max-width: 600px; margin: 10px auto;"></div>
      <div id="auth-success" class="auth-success" style="max-width: 600px; margin: 10px auto;"></div>

      <p id="loading-message" style="margin: 30px 0; color: var(--text);">Cargando...</p>
      <div id="main-form-container"></div>

      <button id="btn-logout" class="auth-btn auth-btn-primary" style="max-width: 200px; margin: 20px auto 0;">
        Cerrar sesión
      </button>
    </div>
  `;

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabase.auth.signOut();
  });

  initCargarMaterias(session);
}

async function initCargarMaterias(session) {
  const loadingMessageEl = document.getElementById('loading-message');
  const formContainerEl = document.getElementById('main-form-container');

  if (!session || !session.user) {
    console.error('No hay sesión de usuario activa.');
    loadingMessageEl.textContent = 'Error: No hay sesión de usuario activa.';
    return;
  }

  const userId = session.user.id;

  try {
    // 1. Traer materias del usuario de la tabla materias_usuario
    const { data: materiasUsuario, error: materiasError } = await supabase
      .from('materias_usuario')
      .select('*')
      .eq('user_id', userId);

    if (materiasError) throw materiasError;

    // Reconstruir el string para el textarea
    let materiasTexto = '';
    materiasTexto = materiasUsuario.map(m => {
      const nombreStr = escapeHtml(m.nombre || '');
      const estadoStr = escapeHtml(m.estado || '');
      const creditosStr = m.creditos !== null && m.creditos !== undefined ? m.creditos : '';
      return `${nombreStr} | ${estadoStr} | ${creditosStr}`;
    }).join('\n');

    // 2. Traer preferencias_usuario
    const { data: prefUsuario, error: prefError } = await supabase
      .from('preferencias_usuario')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (prefError) throw prefError;

    const tipoPeriodo = prefUsuario?.tipo_periodo || 'semestral';
    const maxMaterias = prefUsuario?.max_materias !== undefined && prefUsuario?.max_materias !== null ? prefUsuario.max_materias : '';
    const minMaterias = prefUsuario?.min_materias !== undefined && prefUsuario?.min_materias !== null ? prefUsuario.min_materias : '';

    // 3. Generar HTML del Formulario
    formContainerEl.innerHTML = `
      <form id="materias-form" style="max-width: 600px; margin: 0 auto; text-align: left; display: flex; flex-direction: column; gap: 20px;">
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <label for="materias-texto" style="font-weight: bold; color: var(--text-h);">Materias (un curso por línea):</label>
          <textarea id="materias-texto" class="auth-input" style="height: 200px; font-family: var(--mono); font-size: 15px; resize: vertical;" placeholder="Cálculo | aprobada | 6&#10;Física | cursando | 5&#10;Química | | 4">${materiasTexto}</textarea>
          <span style="font-size: 13px; color: var(--text);">Formato: <strong>Nombre | Estado | Créditos</strong> (Ejemplo: Cálculo | aprobada | 6). Estado y créditos son opcionales.</span>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label for="tipo-periodo" style="font-weight: bold; color: var(--text-h);">Tipo de Período:</label>
            <select id="tipo-periodo" class="auth-input">
              <option value="semestral" ${tipoPeriodo === 'semestral' ? 'selected' : ''}>Semestral</option>
              <option value="cuatrimestral" ${tipoPeriodo === 'cuatrimestral' ? 'selected' : ''}>Cuatrimestral</option>
            </select>
          </div>
          <div></div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label for="min-materias" style="font-weight: bold; color: var(--text-h);">Mín. materias por período:</label>
            <input type="number" id="min-materias" class="auth-input" min="1" value="${minMaterias}" />
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label for="max-materias" style="font-weight: bold; color: var(--text-h);">Máx. materias por período:</label>
            <input type="number" id="max-materias" class="auth-input" min="1" value="${maxMaterias}" />
          </div>
        </div>

        <button type="submit" id="btn-save" class="auth-btn auth-btn-primary" style="margin-top: 10px;">
          Guardar progreso
        </button>
      </form>
    `;

    // 4. Adjuntar manejador submit
    document.getElementById('materias-form').addEventListener('submit', (e) => handleSubmit(e, userId));

  } catch (error) {
    console.error('Error al inicializar la página:', error.message);
    showMessage('error', `Error al inicializar la página: ${error.message}`);
  } finally {
    loadingMessageEl.style.display = 'none';
  }
}

async function handleSubmit(e, userId) {
  e.preventDefault();
  showMessage('clear');

  const btnSave = document.getElementById('btn-save');
  btnSave.disabled = true;
  btnSave.textContent = 'Guardando...';

  try {
    const materiasTextoVal = document.getElementById('materias-texto').value;
    const tipoPeriodoVal = document.getElementById('tipo-periodo').value;
    const minMateriasVal = document.getElementById('min-materias').value;
    const maxMateriasVal = document.getElementById('max-materias').value;

    // Parsear textarea línea por línea
    const lineas = materiasTextoVal.split('\n');
    const parsedMaterias = [];

    for (let i = 0; i < lineas.length; i++) {
      const lineaOriginal = lineas[i];
      const linea = lineaOriginal.trim();
      if (!linea) continue; // Ignorar líneas vacías

      const partes = linea.split('|');
      const nombre = partes[0] ? partes[0].trim() : '';

      if (!nombre) {
        throw new Error(`Error en la línea ${i + 1}: El nombre de la materia es requerido.`);
      }

      const estado = partes[1] ? partes[1].trim() : null;
      const estadoNormalizado = estado ? normalizarEstado(estado) : null;
      let creditos = null;
      if (partes[2] && partes[2].trim()) {
        const parsedCreditos = parseFloat(partes[2].trim());
        if (isNaN(parsedCreditos)) {
          throw new Error(`Error en la línea ${i + 1}: Los créditos deben ser un número válido.`);
        }
        creditos = parsedCreditos;
      }

      parsedMaterias.push({
        user_id: userId,
        nombre: nombre,
        estado: estadoNormalizado,
        creditos: creditos,
        metadata: { linea_original: lineaOriginal }
      });
    }

    // Validación: que al menos una materia sea válida y no se borre todo si no hay materias parseadas
    if (parsedMaterias.length === 0) {
      throw new Error('Debes ingresar al menos una materia válida.');
    }

    // 1. Borrar materias anteriores e insertar las nuevas en materias_usuario
    const { error: deleteError } = await supabase
      .from('materias_usuario')
      .delete()
      .eq('user_id', userId);

    if (deleteError) throw deleteError;

    const { error: insertError } = await supabase
      .from('materias_usuario')
      .insert(parsedMaterias);

    if (insertError) throw insertError;

    // 2. Hacer upsert en preferencias_usuario
    const upsertPayload = {
      user_id: userId,
      tipo_periodo: tipoPeriodoVal,
      max_materias: maxMateriasVal ? parseInt(maxMateriasVal, 10) : null,
      min_materias: minMateriasVal ? parseInt(minMateriasVal, 10) : null
    };

    const { error: upsertError } = await supabase
      .from('preferencias_usuario')
      .upsert(upsertPayload, { onConflict: 'user_id' });

    if (upsertError) throw upsertError;

    showMessage('success', 'Progreso y preferencias guardados con éxito.');

  } catch (error) {
    console.error('Error al guardar el progreso:', error.message);
    showMessage('error', error.message || 'Ocurrió un error al guardar.');
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = 'Guardar progreso';
  }
}
