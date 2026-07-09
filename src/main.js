import './style.css';
import { supabase } from './supabaseClient.js';

const appEl = document.querySelector('#app');

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

// Renderizar pantalla de Autenticación
function renderAuthForm() {
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
    // Si tiene éxito, onAuthStateChange se encargará de actualizar la vista
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
      // En Supabase, dependiendo de la configuración de confirmación de email:
      // Si está activa, pedirá confirmación. Si no, iniciará sesión automáticamente.
      if (data?.user && data?.session === null) {
        showMessage('success', '¡Registro exitoso! Por favor, verifica tu correo electrónico para confirmar tu cuenta.');
      } else {
        showMessage('success', '¡Usuario registrado e ingresado con éxito!');
      }
      setSubmitting(false);
    }
  });
}

// Renderizar pantalla Dashboard de usuario logueado
function renderDashboard(session) {
  const userEmail = session.user.email;

  appEl.innerHTML = `
    <div class="user-dashboard">
      <h1>¡Bienvenido/a!</h1>
      <p>Has iniciado sesión con el correo: <strong>${userEmail}</strong></p>
      
      <button id="btn-logout" class="auth-btn auth-btn-primary" style="max-width: 200px; margin: 0 auto;">
        Cerrar sesión
      </button>
    </div>
  `;

  document.getElementById('btn-logout').addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      alert('Error al cerrar sesión: ' + error.message);
    }
  });
}

// Escuchar cambios de estado de autenticación de Supabase de manera reactiva
supabase.auth.onAuthStateChange((event, session) => {
  console.log(`Evento de Auth: ${event}`, session);
  if (session) {
    renderDashboard(session);
  } else {
    renderAuthForm();
  }
});
