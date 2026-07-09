import { supabase } from '../supabaseClient.js';
import { escapeHtml } from '../utils.js';

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

export function renderLogin() {
  const appEl = document.querySelector('#app');
  appEl.innerHTML = `
    <div class="auth-container">
      <div class="auth-card">
        <h2>Ingresar o Registrarse</h2>
        
        <div id="auth-error" class="auth-error"></div>
        <div id="auth-success" class="auth-success"></div>

        <form id="auth-form">
          <div class="auth-group">
            <label for="email">Correo Electrónico</label>
            <input type="email" id="email" class="auth-input" placeholder="ejemplo@correo.com" required autocomplete="username" />
          </div>
          
          <div class="auth-group">
            <label for="password">Contraseña</label>
            <input type="password" id="password" class="auth-input" placeholder="••••••••" required autocomplete="current-password" />
          </div>

          <div class="auth-buttons-row">
            <button type="submit" id="btn-login" class="auth-btn auth-btn-primary">Iniciar sesión</button>
            <button type="button" id="btn-register" class="auth-btn auth-btn-secondary">Registrarse</button>
          </div>
        </form>
      </div>
    </div>
  `;

  const form = document.getElementById('auth-form');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const btnLogin = document.getElementById('btn-login');
  const btnRegister = document.getElementById('btn-register');

  // Helper para deshabilitar controles durante la carga
  function setSubmitting(isSubmitting) {
    emailInput.disabled = isSubmitting;
    passwordInput.disabled = isSubmitting;
    btnLogin.disabled = isSubmitting;
    btnRegister.disabled = isSubmitting;
    
    if (isSubmitting) {
      btnLogin.textContent = 'Procesando...';
    } else {
      btnLogin.textContent = 'Iniciar sesión';
    }
  }

  // Acción: Iniciar Sesión
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showMessage('clear');
    setSubmitting(true);

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      showMessage('error', error.message || 'Error al iniciar sesión.');
      setSubmitting(false);
    }
  });

  // Acción: Registrarse
  btnRegister.addEventListener('click', async () => {
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    showMessage('clear');
    setSubmitting(true);

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    const { data, error } = await supabase.auth.signUp({ email, password });

    if (error) {
      showMessage('error', error.message || 'Error al registrarse.');
      setSubmitting(false);
    } else {
      if (data?.user && data?.session === null) {
        showMessage('success', '¡Registro exitoso! Por favor, verifica tu correo electrónico para confirmar tu cuenta.');
      } else {
        showMessage('success', '¡Usuario registrado e ingresado con éxito!');
      }
      setSubmitting(false);
    }
  });
}
