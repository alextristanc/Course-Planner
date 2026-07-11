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
      max_materias: preferencias?.max_materias ?? null,
      semestre_actual: preferencias?.semestre_actual ?? null,
      limite_creditos: preferencias?.limite_creditos ?? null,
      horarios_no_disponibles: preferencias?.horarios_no_disponibles || []
    }
  };
}

const DIAS_LABEL = {
  lun: 'Lun',
  mar: 'Mar',
  mie: 'Mié',
  jue: 'Jue',
  vie: 'Vie',
  sab: 'Sáb',
  dom: 'Dom'
};

export function formatearHorario(horario) {
  if (!Array.isArray(horario) || horario.length === 0) return 'Sin horario';
  return horario
    .map((b) => {
      const dia = DIAS_LABEL[b.dia] || b.dia || '?';
      return `${dia} ${b.hora_inicio || '?'}-${b.hora_fin || '?'}`;
    })
    .join(', ');
}

export function renderNav(activeHash) {
  const links = [
    { href: '#/dashboard', label: 'Inicio' },
    { href: '#/plan', label: '1. Plan' },
    { href: '#/oferta', label: '2. Oferta' },
    { href: '#/parametros', label: '3. Parámetros' },
    { href: '#/resultado', label: '4. Resultado' }
  ];

  return `
    <nav class="app-nav">
      ${links
        .map((l) => {
          const isActive = activeHash === l.href;
          return `<a href="${l.href}" class="app-nav-link${isActive ? ' active' : ''}">${l.label}</a>`;
        })
        .join('')}
    </nav>
  `;
}

export function showPageMessage(type, text) {
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

export async function uploadDocumento(supabase, userId, file, subfolder = 'plan') {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${userId}/${subfolder}/${Date.now()}_${safeName}`;

  const { error } = await supabase.storage.from('documentos').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || 'application/octet-stream'
  });

  if (error) throw error;
  return path;
}

export async function callEdgeFunction(functionName, accessToken, body = {}) {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  );

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    throw new Error('Sesión no autorizada. Por favor, reinicia sesión.');
  }

  if (!response.ok || data.error) {
    throw new Error(data.error || `Error del servidor: ${response.status}`);
  }

  return data;
}

export function horaAMinutos(hora) {
  if (!hora) return 0;
  const [h, m] = String(hora).split(':').map(Number);
  return h * 60 + (m || 0);
}

export function bloquesSeSolapan(a, b) {
  if (!a || !b || a.dia !== b.dia) return false;
  const aIni = horaAMinutos(a.hora_inicio);
  const aFin = horaAMinutos(a.hora_fin);
  const bIni = horaAMinutos(b.hora_inicio);
  const bFin = horaAMinutos(b.hora_fin);
  return aIni < bFin && bIni < aFin;
}

export function horariosConflictan(horarioA = [], horarioB = []) {
  for (const a of horarioA) {
    for (const b of horarioB) {
      if (bloquesSeSolapan(a, b)) return true;
    }
  }
  return false;
}
