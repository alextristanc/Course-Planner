import { renderLogin } from './pages/login.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderCargarMaterias } from './pages/cargarMaterias.js';
import { renderResultado } from './pages/resultado.js';

// Mapa de rutas con renderizador y flag de privacidad
export const routes = {
  '#/login': { render: renderLogin, private: false },
  '#/dashboard': { render: renderDashboard, private: true },
  '#/materias': { render: renderCargarMaterias, private: true },
  '#/resultado': { render: renderResultado, private: true }
};

let currentSession = null;
let isListenerAttached = false;

// Manejador del cambio de ruta
export function handleRouteChange() {
  const hash = window.location.hash || '#/login';
  const route = routes[hash];

  // Si la ruta no existe, redirigir según estado de autenticación
  if (!route) {
    if (currentSession) {
      window.location.hash = '#/dashboard';
    } else {
      window.location.hash = '#/login';
    }
    return;
  }

  // Protección de rutas:
  if (route.private && !currentSession) {
    // Si intenta acceder a una ruta privada sin sesión, redirigir a Login
    window.location.hash = '#/login';
    return;
  }

  if (!route.private && currentSession) {
    // Si ya tiene sesión activa e intenta ir al login, redirigir a Dashboard
    window.location.hash = '#/dashboard';
    return;
  }

  // Renderizar la página correspondiente pasándole la sesión actual
  route.render(currentSession);
}

// Inicializar el router y escuchar cambios de hash
export function initRouter(session) {
  currentSession = session;

  if (!isListenerAttached) {
    window.addEventListener('hashchange', handleRouteChange);
    isListenerAttached = true;
  }

  // Ejecutar el enrutador para la URL/hash actual
  handleRouteChange();
}

// Actualizar sesión externamente y forzar re-enrutado
export function setSession(session) {
  currentSession = session;
  handleRouteChange();
}
