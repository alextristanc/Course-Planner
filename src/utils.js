// Escapa caracteres HTML peligrosos para evitar XSS al insertar
// texto dinámico dentro de innerHTML.
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Normaliza el campo "estado" a un valor consistente en minúsculas
// y sin espacios extra, para que el preprocesamiento (filtrar
// aprobadas) funcione sin importar cómo lo escribió el usuario.
const ESTADOS_VALIDOS = ['aprobada', 'cursando', 'pendiente'];

export function normalizarEstado(estadoRaw) {
  if (!estadoRaw) return null;
  const limpio = estadoRaw.toLowerCase().trim();
  if (!limpio) return null;

  if (ESTADOS_VALIDOS.includes(limpio)) return limpio;

  // Tolerar variaciones comunes (typos / acentos)
  if (limpio.startsWith('aprob')) return 'aprobada';
  if (limpio.startsWith('curs')) return 'cursando';
  if (limpio.startsWith('pend')) return 'pendiente';

  // Si no matchea nada conocido, se guarda tal cual pero avisamos
  // en consola para que no sea un bug silencioso.
  console.warn(`Estado no reconocido: "${estadoRaw}". Se guardará sin normalizar.`);
  return limpio;
}