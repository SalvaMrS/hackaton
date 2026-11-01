import { h, api, dinero, DIAS, fechaHoy, mostrarError } from './dom.js';
import { iniciarChat } from './chat.js';

const app = document.getElementById('app');
const barra = document.getElementById('acciones-barra');
const ubicacion = { lat: null, lng: null };
const sesion = { usuario: null, googleHabilitado: false };
let slugActual = null;

iniciarChat({ obtenerContexto: () => ({ ...ubicacion, slug: slugActual }) });

async function cargarSesion() {
  const { usuario, googleHabilitado } = await api('/api/yo');
  sesion.usuario = usuario;
  sesion.googleHabilitado = googleHabilitado;
  dibujarBarra();
}

function dibujarBarra() {
  barra.replaceChildren(
    sesion.usuario
      ? h('span', { class: 'fila' }, h('span', { class: 'suave' }, sesion.usuario.nombre || sesion.usuario.email),
        h('a', { class: 'boton secundario', href: '/#mis-turnos' }, 'Mis turnos'),
        h('button', { class: 'secundario', onclick: async () => { await api('/api/auth/salir', { metodo: 'POST' }); location.href = '/'; } }, 'Salir'))
      : h('span', { class: 'suave' }, 'Navegá libremente; te pedimos ingresar al reservar.'),
    h('a', { class: 'boton secundario', href: '/panel.html' }, 'Soy un comercio'));
}

function formularioIngreso({ alIngresar }) {
  const email = h('input', { type: 'email', placeholder: 'tu@email.com', required: true });
  const password = h('input', { type: 'password', placeholder: 'Contraseña (mín. 6)', required: true });
  const mensaje = h('p');
  const enviar = (ruta) => async (evento) => {
    evento.preventDefault();
    try {
      await api(ruta, { metodo: 'POST', cuerpo: { email: email.value, password: password.value } });
      await cargarSesion();
      alIngresar();
    } catch (error) { mostrarError(mensaje, error); }
  };
  const destino = encodeURIComponent(slugActual ? `/?c=${slugActual}` : '/');
  return h('form', { class: 'tarjeta formulario', onsubmit: enviar('/api/auth/login') },
    h('strong', { style: 'grid-column:1/-1' }, 'Ingresá para confirmar tu reserva'),
    email, password,
    h('div', { class: 'fila' },
      h('button', { type: 'submit' }, 'Ingresar'),
      h('button', { type: 'button', class: 'secundario', onclick: enviar('/api/auth/registro') }, 'Crear cuenta'),
      sesion.googleHabilitado && h('a', { class: 'boton secundario', href: `/api/auth/google?destino=${destino}` }, 'Continuar con Google')),
    mensaje);
}

function pedirUbicacion(alObtener, alFallar) {
  if (!navigator.geolocation) return alFallar();
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => { ubicacion.lat = coords.latitude; ubicacion.lng = coords.longitude; alObtener(); },
    alFallar, { timeout: 8000 });
}

function tarjetaComercio(comercio) {
  return h('a', { class: 'tarjeta', href: `?c=${comercio.slug}`, style: 'text-decoration:none;color:inherit' },
    comercio.imagen_url && h('img', { class: 'servicio-imagen', src: comercio.imagen_url, alt: comercio.nombre }),
    h('strong', {}, comercio.nombre),
    h('div', { class: 'fila' }, h('span', { class: 'etiqueta' }, comercio.rubro),
      comercio.distancia_km != null && h('span', { class: 'suave' }, `a ${comercio.distancia_km} km`)),
    h('p', { class: 'suave' }, comercio.servicios ?? 'Sin servicios cargados'),
    comercio.direccion && h('div', { class: 'suave' }, `📍 ${comercio.direccion}`));
}

function tarjetaTurno(turno, alCambiar) {
  const mapa = turno.lat != null ? `https://www.openstreetmap.org/?mlat=${turno.lat}&mlon=${turno.lng}#map=17/${turno.lat}/${turno.lng}` : null;
  return h('div', { class: 'tarjeta' },
    h('div', { class: 'fila' }, h('strong', {}, turno.comercio), h('span', { class: `etiqueta ${turno.estado}` }, turno.estado.replace('_', ' '))),
    h('p', { style: 'margin:6px 0' }, `📅 ${turno.inicio.slice(0, 10)} · ${turno.inicio.slice(11)}–${turno.fin.slice(11)}`),
    h('div', {}, `${turno.servicio} · ${turno.personas} pers. · a nombre de ${turno.cliente_nombre}`),
    h('div', {}, '🪑 Tu lugar: ', h('strong', {}, turno.plaza)),
    turno.direccion && h('div', { class: 'suave' }, `📍 ${turno.direccion}`, mapa && h('span', {}, ' · ', h('a', { href: mapa, target: '_blank', rel: 'noopener' }, 'ver en el mapa'))),
    turno.telefono && h('div', { class: 'suave' }, `📞 ${turno.telefono}`),
    turno.estado === 'confirmado' && h('button', { class: 'peligro', style: 'margin-top:8px', onclick: async () => {
      await api(`/api/mis-turnos/${turno.id}/cancelar`, { metodo: 'POST' });
      alCambiar();
    } }, 'Cancelar turno'));
}

function seccionMisTurnos() {
  const lista = h('div', { class: 'grilla' });
  async function cargar() {
    try {
      const turnos = await api('/api/mis-turnos');
      const vigentes = turnos.filter((turno) => ['confirmado', 'en_curso'].includes(turno.estado)).reverse();
      const anteriores = turnos.filter((turno) => !vigentes.includes(turno));
      lista.replaceChildren(...(turnos.length ? [...vigentes, ...anteriores].map((turno) => tarjetaTurno(turno, cargar))
        : [h('p', { class: 'suave' }, 'Todavía no tenés turnos. Buscá un comercio y reservá.')]));
    } catch (error) { mostrarError(lista, error); }
  }
  cargar();
  return h('section', { id: 'mis-turnos' }, h('h2', {}, 'Mis turnos'), lista);
}

async function mostrarBuscador() {
  slugActual = null;
  const resultados = h('div', { class: 'grilla' });
  const texto = h('input', { type: 'search', placeholder: 'Buscá un servicio, rubro o comercio…', style: 'flex:1;min-width:220px' });
  const estado = h('p', { class: 'suave' });

  async function buscar() {
    const consulta = new URLSearchParams({ q: texto.value });
    if (ubicacion.lat != null) { consulta.set('lat', ubicacion.lat); consulta.set('lng', ubicacion.lng); }
    try {
      const comercios = await api(`/api/comercios?${consulta}`);
      resultados.replaceChildren(...comercios.map(tarjetaComercio));
      estado.textContent = comercios.length ? '' : 'No encontramos resultados.';
    } catch (error) { mostrarError(estado, error); }
  }

  const usarUbicacion = () => {
    estado.textContent = 'Buscando tu ubicación…';
    pedirUbicacion(buscar, () => { estado.textContent = 'Sin tu ubicación no podemos ordenar por cercanía, pero podés buscar igual.'; });
  };

  app.replaceChildren(
    h('h1', {}, 'Reservá turnos cerca tuyo'),
    h('form', { class: 'fila', onsubmit: (evento) => { evento.preventDefault(); buscar(); } },
      texto, h('button', { type: 'submit' }, 'Buscar'),
      h('button', { type: 'button', class: 'secundario', onclick: usarUbicacion }, '📍 Cerca de mí')),
    estado, resultados, sesion.usuario && seccionMisTurnos());
  buscar();
  pedirUbicacion(buscar, () => { estado.textContent = 'Activá tu ubicación para ver primero lo más cercano. También podés buscar sin ella.'; });
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
  const nombre = h('input', { placeholder: 'Nombre de quien reserva', maxlength: 80 });
  const telefono = h('input', { placeholder: 'Teléfono (opcional)', maxlength: 40 });
  const confirmar = h('button', { disabled: true, onclick: intentarReservar }, 'Confirmar reserva');
  const mensaje = h('p');
  const zonaIngreso = h('div');
  const pasoReserva = h('div', { class: 'tarjeta', hidden: true },
    h('h2', { style: 'margin-top:0' }, '2. Elegí día y horario'),
    h('div', { class: 'fila' }, h('label', {}, '¿Para cuántas personas?', personas), h('label', {}, 'Día', fecha)),
    h('p', { class: 'suave' }, `Te asignamos automáticamente el lugar que mejor se ajuste (hasta ${comercio.capacidad_maxima} personas por reserva).`),
    h('p', { class: 'suave' }, 'Horarios disponibles'), franjas,
    h('h2', {}, '3. ¿A nombre de quién?'),
    h('div', { class: 'fila' }, nombre, telefono, confirmar), mensaje, zonaIngreso);

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

  function intentarReservar() {
    if (!nombre.value.trim()) { mensaje.className = 'mensaje-error'; mensaje.textContent = 'Indicá a nombre de quién es la reserva'; return; }
    mensaje.textContent = '';
    if (sesion.usuario) return reservar();
    zonaIngreso.replaceChildren(formularioIngreso({ alIngresar: () => { zonaIngreso.replaceChildren(); reservar(); } }));
    return null;
  }

  async function reservar() {
    confirmar.disabled = true;
    try {
      const turno = await api(`/api/comercios/${slug}/turnos`, { metodo: 'POST', cuerpo: {
        servicio_id: reserva.servicio.id, inicio: reserva.inicio, personas: Number(personas.value),
        cliente_nombre: nombre.value, cliente_telefono: telefono.value } });
      pasoReserva.replaceChildren(h('h2', { class: 'mensaje-ok', style: 'margin-top:0' }, '¡Reserva confirmada!'),
        h('p', {}, `${turno.servicio} · ${turno.inicio.replace('T', ' ')} · para ${personas.value}`),
        h('p', {}, 'Tu lugar: ', h('strong', {}, turno.plaza)),
        h('a', { class: 'boton', href: '/#mis-turnos' }, 'Ver mis turnos'));
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
  personas.addEventListener('input', () => { if (Number(personas.value) >= 1) cargarFranjas(); });
  nombre.value = sesion.usuario?.nombre ?? '';

  const horarios = comercio.horarios.map((horario) => `${DIAS[horario.dia_semana]} ${horario.apertura}–${horario.cierre}`);
  app.replaceChildren(
    h('a', { href: '/' }, '← Volver'),
    h('div', { class: 'portada', style: comercio.imagen_url ? `background-image:linear-gradient(#0000,#000a),url("${comercio.imagen_url}")` : '' },
      h('h1', {}, comercio.nombre),
      h('div', { class: 'fila' }, h('span', { class: 'etiqueta' }, comercio.rubro),
        comercio.direccion && h('span', {}, `📍 ${comercio.direccion}`),
        comercio.telefono && h('span', {}, `📞 ${comercio.telefono}`))),
    comercio.descripcion && h('p', {}, comercio.descripcion),
    horarios.length > 0 && h('p', { class: 'suave' }, `Horarios: ${horarios.join(' · ')}`),
    h('h2', {}, '1. Elegí un servicio'),
    h('div', { class: 'grilla' }, comercio.servicios.map((servicio) => h('div', { class: `tarjeta ${servicio.oferta ? 'oferta' : ''}` },
      servicio.oferta ? h('span', { class: 'cinta-oferta' }, '🔥 OFERTA') : null,
      servicio.imagen_url && h('img', { class: 'servicio-imagen', src: servicio.imagen_url, alt: servicio.nombre }),
      h('strong', {}, servicio.nombre),
      h('div', { class: 'suave' }, servicio.oferta
        ? [h('span', { class: 'precio-tachado' }, dinero(servicio.precio_centavos)), h('span', { class: 'precio-oferta' }, dinero(servicio.precio_oferta_centavos)), ` · ${servicio.duracion_min} min`]
        : `${dinero(servicio.precio_centavos)} · ${servicio.duracion_min} min`),
      servicio.descripcion && h('p', {}, servicio.descripcion),
      servicio.caracteristicas && h('p', { class: 'suave' }, servicio.caracteristicas),
      h('button', { onclick: () => elegirServicio(servicio) }, 'Reservar')))),
    pasoReserva);
}

await cargarSesion();
const slug = new URLSearchParams(location.search).get('c');
if (slug) await mostrarComercio(slug); else await mostrarBuscador();
