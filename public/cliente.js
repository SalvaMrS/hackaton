import { h, api, dinero, DIAS, fechaHoy, mostrarError } from './dom.js';
import { iniciarChat } from './chat.js';

const app = document.getElementById('app');
const ubicacion = { lat: null, lng: null };
let slugActual = null;
const CLAVE_MIS_TURNOS = 'mis-turnos';

function leerCodigosGuardados() {
  try { return JSON.parse(localStorage.getItem(CLAVE_MIS_TURNOS)) ?? []; } catch { return []; }
}

function guardarCodigo(codigo) {
  try {
    const codigos = new Set(leerCodigosGuardados());
    codigos.add(codigo);
    localStorage.setItem(CLAVE_MIS_TURNOS, JSON.stringify([...codigos]));
  } catch { /* sin almacenamiento: el cliente igual conserva su código */ }
}

function tarjetaTurno(turno, alCambiar) {
  const mapa = turno.lat != null ? `https://www.openstreetmap.org/?mlat=${turno.lat}&mlon=${turno.lng}#map=17/${turno.lat}/${turno.lng}` : null;
  return h('div', { class: 'tarjeta' },
    h('div', { class: 'fila' }, h('strong', {}, turno.comercio), h('span', { class: `etiqueta ${turno.estado}` }, turno.estado.replace('_', ' '))),
    h('p', { style: 'margin:6px 0' }, `📅 ${turno.inicio.slice(0, 10)} · ${turno.inicio.slice(11)}–${turno.fin.slice(11)}`),
    h('div', {}, `${turno.servicio} · ${turno.personas} pers.`),
    h('div', {}, `🪑 Tu lugar: `, h('strong', {}, turno.plaza)),
    turno.direccion && h('div', { class: 'suave' }, `📍 ${turno.direccion}`, mapa && h('span', {}, ' · ', h('a', { href: mapa, target: '_blank', rel: 'noopener' }, 'ver en el mapa'))),
    turno.telefono && h('div', { class: 'suave' }, `📞 ${turno.telefono}`),
    h('div', { class: 'suave' }, `Código: ${turno.codigo}`),
    turno.estado === 'confirmado' && h('button', { class: 'peligro', style: 'margin-top:8px', onclick: async () => {
      await api(`/api/turnos/codigo/${turno.codigo}/cancelar`, { metodo: 'POST' });
      alCambiar();
    } }, 'Cancelar turno'));
}

function seccionMisTurnos() {
  const lista = h('div', { class: 'grilla' });
  const codigo = h('input', { placeholder: 'Código de tu reserva', maxlength: 10, style: 'width:190px;text-transform:uppercase' });
  const mensaje = h('p');

  async function cargar() {
    const turnos = [];
    for (const guardado of leerCodigosGuardados()) {
      try { turnos.push(await api(`/api/turnos/codigo/${guardado}`)); } catch { /* código inexistente: se omite */ }
    }
    turnos.sort((a, b) => a.inicio.localeCompare(b.inicio));
    lista.replaceChildren(...(turnos.length ? turnos.map((turno) => tarjetaTurno(turno, cargar))
      : [h('p', { class: 'suave' }, 'Todavía no tenés turnos. Reservá uno o ingresá tu código.')]));
  }

  async function agregarPorCodigo(evento) {
    evento.preventDefault();
    try {
      const turno = await api(`/api/turnos/codigo/${encodeURIComponent(codigo.value.trim())}`);
      guardarCodigo(turno.codigo);
      codigo.value = '';
      mensaje.textContent = '';
      await cargar();
    } catch (error) { mostrarError(mensaje, error); }
  }

  cargar();
  return h('section', {}, h('h2', {}, 'Mis turnos'),
    h('form', { class: 'fila', onsubmit: agregarPorCodigo }, codigo, h('button', { type: 'submit', class: 'secundario' }, 'Buscar mi turno')),
    mensaje, lista);
}

iniciarChat({ obtenerContexto: () => ({ ...ubicacion, slug: slugActual }) });

function tarjetaComercio(comercio) {
  return h('a', { class: 'tarjeta', href: `?c=${comercio.slug}`, style: 'text-decoration:none;color:inherit' },
    h('strong', {}, comercio.nombre),
    h('div', { class: 'fila' }, h('span', { class: 'etiqueta' }, comercio.rubro),
      comercio.distancia_km != null && h('span', { class: 'suave' }, `a ${comercio.distancia_km} km`)),
    h('p', { class: 'suave' }, comercio.servicios ?? 'Sin servicios cargados'),
    comercio.direccion && h('div', { class: 'suave' }, `📍 ${comercio.direccion}`));
}

async function mostrarBuscador() {
  slugActual = null;
  const resultados = h('div', { class: 'grilla' });
  const texto = h('input', { type: 'search', placeholder: 'Buscá un servicio, rubro o comercio…', style: 'flex:1;min-width:220px' });
  const estado = h('p', { class: 'suave' });

  async function buscar() {
    const consulta = new URLSearchParams({ q: texto.value });
    if (ubicacion.lat != null) consulta.set('lat', ubicacion.lat), consulta.set('lng', ubicacion.lng);
    try {
      const comercios = await api(`/api/comercios?${consulta}`);
      resultados.replaceChildren(...comercios.map(tarjetaComercio));
      estado.textContent = comercios.length ? '' : 'No encontramos resultados.';
    } catch (error) { mostrarError(estado, error); }
  }

  function usarUbicacion() {
    estado.textContent = 'Buscando tu ubicación…';
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { ubicacion.lat = coords.latitude; ubicacion.lng = coords.longitude; buscar(); },
      () => { estado.textContent = 'No pudimos obtener tu ubicación; mostramos todos los comercios.'; },
      { timeout: 8000 });
  }

  app.replaceChildren(
    h('h1', {}, 'Reservá turnos cerca tuyo'),
    h('form', { class: 'fila', onsubmit: (evento) => { evento.preventDefault(); buscar(); } },
      texto, h('button', { type: 'submit' }, 'Buscar'),
      h('button', { type: 'button', class: 'secundario', onclick: usarUbicacion }, '📍 Cerca de mí')),
    estado, resultados, seccionMisTurnos());
  buscar();
}

async function mostrarComercio(slug) {
  slugActual = slug;
  let comercio;
  try { comercio = await api(`/api/comercios/${encodeURIComponent(slug)}`); } catch (error) {
    app.replaceChildren(h('p', { class: 'mensaje-error' }, error.message), h('a', { href: '/' }, '← Volver'));
    return;
  }
  const reserva = { servicio: null, inicio: null };
  const fecha = h('input', { type: 'date', value: fechaHoy(), min: fechaHoy() });
  const personas = h('input', { type: 'number', min: 1, max: comercio.capacidad_maxima || 1, value: 1, style: 'width:90px' });
  const franjas = h('div', { class: 'franjas' });
  const cierre = h('div');
  const nombre = h('input', { placeholder: 'Nombre de quien reserva', maxlength: 80 });
  const telefono = h('input', { placeholder: 'Teléfono (opcional)', maxlength: 40 });
  const confirmar = h('button', { disabled: true, onclick: reservar }, 'Confirmar reserva');
  const mensaje = h('p');
  const pasoReserva = h('div', { class: 'tarjeta', hidden: true },
    h('h2', { style: 'margin-top:0' }, '2. Elegí día y horario'),
    h('div', { class: 'fila' }, h('label', {}, '¿Para cuántas personas?', personas), h('label', {}, 'Día', fecha)),
    h('p', { class: 'suave' }, `Te asignamos automáticamente el lugar que mejor se ajuste (hasta ${comercio.capacidad_maxima} personas por reserva).`),
    h('p', { class: 'suave' }, 'Horarios disponibles'), franjas,
    h('h2', {}, '3. ¿A nombre de quién?'),
    h('div', { class: 'fila' }, nombre, telefono, confirmar), mensaje);

  async function cargarFranjas() {
    reserva.inicio = null;
    confirmar.disabled = true;
    const consulta = new URLSearchParams({ servicio_id: reserva.servicio.id, fecha: fecha.value, personas: personas.value });
    try {
      const lista = await api(`/api/comercios/${slug}/disponibilidad?${consulta}`);
      franjas.replaceChildren(...(lista.length ? lista.map((franja) => h('button', {
        type: 'button',
        onclick: (evento) => {
          franjas.querySelectorAll('button').forEach((boton) => boton.classList.remove('elegida'));
          evento.currentTarget.classList.add('elegida');
          reserva.inicio = franja.inicio;
          confirmar.disabled = false;
        },
      }, franja.inicio.slice(11))) : [h('span', { class: 'suave' }, 'No hay lugar libre para esa cantidad de personas ese día.')]));
    } catch (error) { mostrarError(franjas, error); }
  }

  async function reservar() {
    confirmar.disabled = true;
    try {
      const turno = await api(`/api/comercios/${slug}/turnos`, { metodo: 'POST', cuerpo: {
        servicio_id: reserva.servicio.id, inicio: reserva.inicio, personas: Number(personas.value),
        cliente_nombre: nombre.value, cliente_telefono: telefono.value } });
      guardarCodigo(turno.codigo);
      pasoReserva.replaceChildren(h('h2', { class: 'mensaje-ok', style: 'margin-top:0' }, '¡Reserva confirmada!'),
        h('p', {}, `${turno.servicio} · ${turno.inicio.replace('T', ' ')} · para ${personas.value} · ${turno.plaza}`),
        h('p', {}, 'Tu código: ', h('strong', {}, turno.codigo)),
        h('a', { class: 'boton', href: '/' }, 'Ver mis turnos'));
    } catch (error) {
      mensaje.className = 'mensaje-error';
      mensaje.textContent = error.message;
      confirmar.disabled = false;
      if (error.code === 'sin_disponibilidad') cargarFranjas();
    }
  }

  function elegirServicio(servicio) {
    reserva.servicio = servicio;
    pasoReserva.hidden = false;
    pasoReserva.scrollIntoView({ behavior: 'smooth' });
    cargarFranjas();
  }

  fecha.addEventListener('change', cargarFranjas);
  personas.addEventListener('input', () => { if (personas.value && Number(personas.value) >= 1) cargarFranjas(); });

  const horarios = comercio.horarios.map((horario) => `${DIAS[horario.dia_semana]} ${horario.apertura}–${horario.cierre}`);
  app.replaceChildren(
    h('a', { href: '/' }, '← Volver'),
    h('h1', {}, comercio.nombre),
    h('div', { class: 'fila' }, h('span', { class: 'etiqueta' }, comercio.rubro),
      comercio.direccion && h('span', { class: 'suave' }, `📍 ${comercio.direccion}`),
      comercio.telefono && h('span', { class: 'suave' }, `📞 ${comercio.telefono}`)),
    comercio.descripcion && h('p', {}, comercio.descripcion),
    horarios.length > 0 && h('p', { class: 'suave' }, `Horarios: ${horarios.join(' · ')}`),
    h('h2', {}, '1. Elegí un servicio'),
    h('div', { class: 'grilla' }, comercio.servicios.map((servicio) => h('div', { class: 'tarjeta' },
      h('strong', {}, servicio.nombre),
      h('div', { class: 'suave' }, `${dinero(servicio.precio_centavos)} · ${servicio.duracion_min} min`),
      servicio.descripcion && h('p', {}, servicio.descripcion),
      servicio.caracteristicas && h('p', { class: 'suave' }, servicio.caracteristicas),
      h('button', { onclick: () => elegirServicio(servicio) }, 'Reservar')))),
    pasoReserva, cierre);
}

const slug = new URLSearchParams(location.search).get('c');
if (slug) mostrarComercio(slug); else mostrarBuscador();
