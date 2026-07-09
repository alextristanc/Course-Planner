import { supabase } from '../supabaseClient.js';
import { escapeHtml } from '../utils.js';

export function renderResultado(session) {
  const appEl = document.querySelector('#app');
  const userEmail = session?.user?.email || 'Usuario';

  appEl.innerHTML = `
    <div class="user-dashboard">
      <h1>Resultado de Planificación</h1>
      <p>Usuario: <strong>${userEmail}</strong></p>
      
      <nav style="margin: 20px 0; display: flex; justify-content: center; gap: 15px;">
        <a href="#/dashboard" style="color: var(--text); text-decoration: none;">Dashboard</a>
        <a href="#/materias" style="color: var(--text); text-decoration: none;">Cargar Materias</a>
        <a href="#/resultado" style="color: var(--accent); font-weight: bold; text-decoration: none;">Resultado</a>
      </nav>

      <p style="margin: 30px 0; color: var(--text);">[Vista de resultados de planificación aquí]</p>

      <button id="btn-logout" class="auth-btn auth-btn-primary" style="max-width: 200px; margin: 20px auto 0;">
        Cerrar sesión
      </button>
    </div>
  `;

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabase.auth.signOut();
  });
}
