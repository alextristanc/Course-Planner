import { supabase } from '../supabaseClient.js';
import { escapeHtml } from '../utils.js';

export function renderDashboard(session) {
  const appEl = document.querySelector('#app');
  const userEmail = escapeHtml(session?.user?.email || 'Usuario');

  appEl.innerHTML = `
    <div class="user-dashboard">
      <h1>Dashboard Principal</h1>
      <p>Bienvenido/a, <strong>${userEmail}</strong>!</p>
      
      <nav style="margin: 20px 0; display: flex; justify-content: center; gap: 15px;">
        <a href="#/dashboard" style="color: var(--accent); font-weight: bold; text-decoration: none;">Dashboard</a>
        <a href="#/materias" style="color: var(--text); text-decoration: none;">Cargar Materias</a>
        <a href="#/resultado" style="color: var(--text); text-decoration: none;">Resultado</a>
      </nav>

      <button id="btn-logout" class="auth-btn auth-btn-primary" style="max-width: 200px; margin: 20px auto 0;">
        Cerrar sesión
      </button>
    </div>
  `;

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await supabase.auth.signOut();
  });
}
