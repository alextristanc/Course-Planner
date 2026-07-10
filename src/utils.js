// src/utils.js

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

  if (limpio.startsWith('aprob')) return 'aprobada';
  if (limpio.startsWith('curs')) return 'cursando';
  if (limpio.startsWith('pend')) return 'pendiente';

  console.warn(`Estado no reconocido: "${estadoRaw}". Se guardará sin normalizar.`);
  return limpio;
}

// Filtra materias aprobadas y arma el contexto que se le manda a la IA.
// Se hace en el cliente (no en la Edge Function) para no mandar datos
// de más y porque es lógica simple que no necesita estar en el servidor.
export function prepararContextoParaIA(materiasUsuario, preferencias) {
  const materiasPendientes = materiasUsuario
    .filter((m) => m.estado !== 'aprobada')
    .map((m) => ({
      nombre: m.nombre,
      estado: m.estado || 'pendiente',
      creditos: m.creditos ?? null
    }));

  return {
    materias: materiasPendientes,
    total_aprobadas: materiasUsuario.length - materiasPendientes.length,
    preferencias: {
      tipo_periodo: preferencias?.tipo_periodo || 'semestral',
      min_materias: preferencias?.min_materias ?? null,
      max_materias: preferencias?.max_materias ?? null
    }
  };
}