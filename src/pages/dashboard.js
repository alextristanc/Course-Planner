import { supabase } from '../supabaseClient.js';
import { escapeHtml, renderNav } from '../utils.js';

export function renderDashboard(session) {
  const appEl = document.querySelector('#app');
  const userEmail = escapeHtml(session?.user?.email || 'Usuario');

  appEl.innerHTML = `
    <div class="user-dashboard page-wide">
      <h1>Course Planner</h1>
      <p>Bienvenido/a, <strong>${userEmail}</strong></p>
      ${renderNav('#/dashboard')}

      <div class="card-section" style="max-width: 800px; margin: 24px auto 0; text-align: left;">
        <h2>Flujo de planeación académica</h2>
        <p class="hint-text" style="margin-bottom: 16px;">
          Sigue estos pasos para armar tu carga del periodo con ayuda de IA.
        </p>
        <ol class="flow-steps">
          <li>
            <a href="#/plan"><strong>1. Plan académico</strong></a>
            <span> — Sube tu kardex/plan o captura materias. Revisa y corrige lo extraído por la IA.</span>
          </li>
          <li>
            <a href="#/oferta"><strong>2. Oferta de materias</strong></a>
            <span> — Carga la oferta del periodo, revisa grupos y asigna prioridades.</span>
          </li>
          <li>
            <a href="#/parametros"><strong>3. Parámetros</strong></a>
            <span> — Define semestre, límites de materias/créditos y horarios no disponibles. Genera la recomendación.</span>
          </li>
          <li>
            <a href="#/resultado"><strong>4. Resultado</strong></a>
            <span> — Revisa la propuesta, edita grupos y confirma tu carga final.</span>
          </li>
        </ol>
      </div>

      <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; margin-top: 28px; max-width: 800px; margin-left: auto; margin-right: auto;">
        <a href="#/plan" class="auth-btn auth-btn-primary" style="flex: 1; min-width: 180px; text-decoration: none; display: flex; align-items: center; justify-content: center;">
          Empezar con el Plan
        </a>
        <a href="#/resultado" class="auth-btn auth-btn-secondary" style="flex: 1; min-width: 180px; text-decoration: none; display: flex; align-items: center; justify-content: center;">
          Ver última recomendación
        </a>
      </div>

      <button id="btn-logout" class="auth-btn auth-btn-primary" style="max-width: 200px; margin: 28px auto 0;">
        Cerrar sesión
      </button>
    </div>
  `;

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabase.auth.signOut();
  });
}
