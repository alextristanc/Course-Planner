import './style.css';
import { supabase } from './supabaseClient.js';
import { initRouter, setSession } from './router.js';

let isRouterInitialized = false;

// Escuchar cambios en la sesión de Supabase de manera centralizada
supabase.auth.onAuthStateChange((event, session) => {
  console.log(`[Main] Evento de Auth: ${event}`, session);
  
  if (!isRouterInitialized) {
    // Primera carga: Inicializar el enrutador con la sesión detectada
    initRouter(session);
    isRouterInitialized = true;
  } else {
    // Siguientes cambios (Login / Logout): Actualizar sesión del enrutador
    setSession(session);
  }
});
