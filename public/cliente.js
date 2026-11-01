import { h, api, dinero, DIAS, fechaHoy, mostrarError, botonGoogleDeshabilitado, grupoBotones, contador, campoFormulario,
  leerUbicacionGuardada, formularioDireccion, iconoRubro, cuentasDePrueba, esMovil } from './dom.js';
import { iniciarChat } from './chat.js';

const app = document.getElementById('app');
const barra = document.getElementById('acciones-barra');
const ubicacion = leerUbicacionGuardada();
const sesion = { usuario: null, googleHabilitado: false };
let slugActual = null;
const DIAS_A_EXPLORAR = 7;
const PERIODOS = [['☀️ Mañana', 0, 12], ['🌤️ Tarde', 12, 20], ['🌙 Noche', 20, 24]];

function agruparPorPeriodoYHora(lista) {
  return PERIODOS.map(([titulo, desde, hasta]) => {
    const porHora = new Map();
    for (const franja of lista) {
      const hora = Number(franja.inicio.slice(11, 13));
      if (hora >= desde && hora < hasta) porHora.set(hora, [...(porHora.get(hora) ?? []), franja]);
    }
    return { titulo, filas: [...porHora] };
  }).filter(({ filas }) => filas.length);
}

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
      : h('a', { class: 'boton secundario', href: '/?ingresar=1' }, 'Ingresar'),
    h('a', { class: 'boton', href: '/panel.html' }, 'Soy un comercio'));
}

function formularioIngreso({ alIngresar, titulo = 'Ingresá para confirmar tu reserva' }) {
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
    h('strong', { style: 'grid-column:1/-1' }, titulo),
    email, password,
    h('div', { class: 'fila' },
      h('button', { type: 'submit' }, 'Ingresar'),
      h('button', { type: 'button', class: 'secundario', onclick: enviar('/api/auth/registro') }, 'Crear cuenta'),
      sesion.googleHabilitado && h('a', { class: 'boton secundario', href: `/api/auth/google?destino=${destino}` }, 'Continuar con Google')),
    !sesion.googleHabilitado && botonGoogleDeshabilitado(),
    mensaje);
}


function resumirHorarios(horarios) {
  const porRango = new Map();
  for (const { dia_semana: dia, apertura, cierre } of horarios) {
    const rango = `${apertura}–${cierre}`;
    porRango.set(rango, [...(porRango.get(rango) ?? []), dia]);
  }
  return [...porRango].map(([rango, dias]) => {
    const orden = [...dias].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    const corrido = orden.every((dia, indice) => indice === 0 || (dia + 6) % 7 === ((orden[indice - 1] + 6) % 7) + 1);
    const nombres = dias.length === 7 ? 'Todos los días'
      : corrido && orden.length > 2 ? `${DIAS[orden[0]]} a ${DIAS[orden.at(-1)]}` : orden.map((dia) => DIAS[dia]).join(', ');
    return `${nombres} ${rango}`;
  });
}

function tarjetaComercio(comercio) {
  const portada = comercio.imagen_url
    ? h('img', { class: 'tarjeta-foto', src: comercio.imagen_url, alt: comercio.nombre, loading: 'lazy' })
    : h('div', { class: 'tarjeta-foto sin-foto' }, iconoRubro(comercio.rubro));
  return h('a', { class: 'tarjeta tarjeta-comercio', href: `?c=${comercio.slug}` },
    h('div', { class: 'tarjeta-portada' }, portada,
      h('span', { class: 'insignia' }, `${iconoRubro(comercio.rubro)} ${comercio.rubro}`),
      comercio.distancia_km != null && h('span', { class: 'insignia distancia' }, `a ${comercio.distancia_km} km`)),
    h('strong', {}, comercio.nombre),
    h('p', { class: 'suave servicios-lista' }, comercio.servicios ?? 'Sin servicios cargados'),
    comercio.direccion && h('div', { class: 'suave' }, `📍 ${comercio.direccion}`),
    h('span', { class: 'boton' }, 'Ver y reservar'));
}

function tarjetaAnuncio(anuncio) {
  const fondo = anuncio.imagen || anuncio.portada;
  return h('a', { class: 'anuncio', href: `?c=${anuncio.slug}`, style: fondo ? `background-image:linear-gradient(90deg,#000b,#0002),url("${fondo}")` : '' },
    h('span', { class: 'anuncio-etiqueta' }, '🔥 OFERTA'),
    h('strong', {}, anuncio.servicio),
    h('span', { class: 'anuncio-comercio' }, `${iconoRubro(anuncio.rubro)} ${anuncio.comercio}`),
    h('span', { class: 'anuncio-precio' }, h('s', {}, dinero(anuncio.precio_normal)), ' ', h('b', {}, dinero(anuncio.precio_oferta))),
    h('span', { class: 'boton' }, 'Reservar ahora'));
}

async function seccionPublicidad() {
  const anuncios = await api('/api/anuncios').catch(() => []);
  if (!anuncios.length) return null;
  const pista = h('div', { class: 'anuncios-pista' }, ...anuncios.map(tarjetaAnuncio));
  const mover = (sentido) => pista.scrollBy({ left: sentido * pista.clientWidth * 0.9, behavior: 'smooth' });
  const avanzar = () => {
    if (!pista.isConnected) { clearInterval(reloj); return; }
    if (pista.scrollLeft + pista.clientWidth >= pista.scrollWidth - 4) pista.scrollTo({ left: 0, behavior: 'smooth' }); else mover(1);
  };
  const reloj = setInterval(avanzar, 5500);
  return h('section', { class: 'anuncios' },
    h('div', { class: 'anuncios-cabecera' }, h('h2', {}, 'Ofertas destacadas'), h('span', { class: 'etiqueta-publi' }, 'Publicidad de prueba')),
    h('div', { class: 'anuncios-marco' }, pista,
      h('button', { type: 'button', class: 'flecha izquierda', 'aria-label': 'Anterior', onclick: () => mover(-1) }, '‹'),
      h('button', { type: 'button', class: 'flecha derecha', 'aria-label': 'Siguiente', onclick: () => mover(1) }, '›')));
}

function bandaParaComercios() {
  return h('section', { class: 'banda-comercios' },
    h('div', {}, h('h2', {}, '¿Tenés un comercio?'), h('p', {}, 'Dejá de perder turnos: tus clientes reservan solos y vos ves el salón en vivo.')),
    h('a', { class: 'boton', href: '/panel.html' }, 'Anunciá tu comercio'));
}

function tarjetaEsqueleto() {
  return h('div', { class: 'tarjeta tarjeta-comercio esqueleto', 'aria-hidden': 'true' },
    h('div', { class: 'tarjeta-portada' }), h('div', { class: 'linea-esqueleto ancha' }), h('div', { class: 'linea-esqueleto' }), h('div', { class: 'linea-esqueleto corta' }));
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
  const resultados = h('div', { class: 'grilla', 'aria-busy': 'true' }, ...Array.from({ length: 6 }, tarjetaEsqueleto));
  const texto = h('input', { type: 'search', placeholder: 'Buscá un servicio, rubro o comercio…' });
  const estado = h('p', { class: 'suave' });
  const chips = h('div', { class: 'chips-rubro', hidden: true });
  const botonFiltro = h('button', { type: 'button', class: 'secundario', 'aria-expanded': 'false', onclick: () => alternarFiltros() }, '🏷️ Filtrar por tipo ▾');
  const filtroActivo = h('button', { type: 'button', class: 'filtro-activo', hidden: true, title: 'Quitar filtro', onclick: () => elegirRubro('') });
  const barraFiltros = h('div', { class: 'fila barra-filtros' }, botonFiltro, filtroActivo);
  let rubroElegido = '';

  function alternarFiltros(abrir = chips.hidden) {
    chips.hidden = !abrir;
    botonFiltro.textContent = abrir ? '🏷️ Ocultar tipos ▴' : '🏷️ Filtrar por tipo ▾';
    botonFiltro.setAttribute('aria-expanded', String(abrir));
  }

  function elegirRubro(rubro) {
    rubroElegido = rubro;
    filtroActivo.hidden = !rubro;
    filtroActivo.textContent = rubro ? `${iconoRubro(rubro)} ${rubro}  ✕` : '';
    alternarFiltros(false);
    cargarRubros();
    buscar();
  }

  async function cargarRubros() {
    const rubros = await api('/api/rubros').catch(() => []);
    chips.replaceChildren(...['', ...rubros].map((rubro) => h('button', {
      type: 'button', class: rubro === rubroElegido ? 'activa' : '', onclick: () => elegirRubro(rubro),
    }, rubro ? `${iconoRubro(rubro)} ${rubro}` : 'Todos los tipos')));
  }

  async function buscar() {
    const consulta = new URLSearchParams({ q: texto.value, rubro: rubroElegido });
    if (ubicacion.lat != null) { consulta.set('lat', ubicacion.lat); consulta.set('lng', ubicacion.lng); }
    try {
      const comercios = await api(`/api/comercios?${consulta}`);
      resultados.setAttribute('aria-busy', 'false');
      resultados.replaceChildren(...(comercios.length ? comercios.map(tarjetaComercio) : [h('div', { class: 'vacio' },
        h('strong', {}, 'No encontramos comercios'), h('p', { class: 'suave' }, 'Probá con otra palabra o quitá el filtro de tipo.'),
        h('button', { type: 'button', onclick: () => { texto.value = ''; elegirRubro(''); } }, 'Ver todos los comercios'))]));
      estado.textContent = '';
    } catch (error) { mostrarError(estado, error); }
  }

  const ubicacionTexto = h('p', { class: 'suave' });
  const zonaDireccion = h('div');
  const fijarUbicacion = (nueva) => {
    Object.assign(ubicacion, nueva);
    zonaDireccion.replaceChildren();
    ubicacionTexto.textContent = nueva.nombre ? `📍 Ordenado por cercanía a: ${nueva.nombre}` : '📍 Ordenado por cercanía a tu ubicación';
    buscar();
  };
  const pedirDireccion = (aviso) => {
    ubicacionTexto.textContent = aviso;
    zonaDireccion.replaceChildren(formularioDireccion({ alObtener: fijarUbicacion }));
  };
  const publicidad = h('div');
  seccionPublicidad().then((seccion) => seccion && publicidad.replaceChildren(seccion));
  app.replaceChildren(
    h('section', { class: 'hero' },
      h('h1', {}, 'Reservá tu turno en segundos'),
      h('p', {}, 'Canchas, restaurantes, talleres, spa, consultorios y más. Sin llamadas ni mensajes perdidos.'),
      h('form', { class: 'hero-busqueda', onsubmit: (evento) => { evento.preventDefault(); buscar(); } }, texto, h('button', { type: 'submit' }, 'Buscar')),
      h('div', { class: 'fila hero-acciones' },
        h('button', { type: 'button', class: 'secundario', onclick: () => pedirDireccion('Escribí tu dirección o barrio:') }, '✏️ Mi dirección'),
        h('button', { type: 'button', class: 'secundario', disabled: true, title: 'Disponible con certificado SSL (HTTPS)' }, '📍 Cerca de mí · requiere SSL'))),
    h('div', { class: 'seccion' }, ubicacionTexto, zonaDireccion), publicidad,
    h('section', { class: 'seccion' }, h('h2', {}, 'Comercios'), barraFiltros, chips, estado, resultados),
    ...(sesion.usuario ? [seccionMisTurnos()] : []), bandaParaComercios());
  cargarRubros();
  buscar();
  if (ubicacion.lat != null) fijarUbicacion(ubicacion);
  else ubicacionTexto.textContent = 'Indicá tu dirección para ver primero lo más cercano. También podés buscar sin ubicación.';
}

async function mostrarComercio(slug) {
  slugActual = slug;
  let comercio;
  try { comercio = await api(`/api/comercios/${encodeURIComponent(slug)}`); } catch (error) {
    app.replaceChildren(h('p', { class: 'mensaje-error' }, error.message), h('a', { class: 'boton secundario', href: '/' }, '← Volver'));
    return;
  }
  const reserva = { servicio: null, inicio: null };
  const fecha = h('input', { type: 'date', value: fechaHoy(), min: fechaHoy() });
  const hayGrupos = comercio.capacidad_maxima > 1;
  const personas = contador({ min: 1, max: comercio.capacidad_maxima || 1, valor: 1 });
  const atajos = h('div', { class: 'segmentado' }, ...[['Hoy', 0], ['Mañana', 1], ['Pasado mañana', 2]].map(([texto, dias]) => h('button', {
    type: 'button', 'data-fecha': fechaHoy(dias), onclick: () => { fecha.value = fechaHoy(dias); marcarAtajos(); cargarFranjas(); },
  }, texto)));
  const marcarAtajos = () => atajos.querySelectorAll('button').forEach((boton) => boton.classList.toggle('activa', boton.dataset.fecha === fecha.value));
  const franjas = h('div', { class: 'horarios-dia' });
  const nombre = h('input', { placeholder: 'Nombre de quien reserva', maxlength: 80 });
  const telefono = h('input', { placeholder: 'Teléfono (opcional)', maxlength: 40 });
  const confirmar = h('button', { disabled: true, onclick: intentarReservar }, 'Confirmar reserva');
  const mensaje = h('p');
  const zonaIngreso = h('div');
  const pasoReserva = h('div', { class: 'tarjeta', hidden: true },
    h('h2', { style: 'margin-top:0' }, '2. Elegí día y horario'),
    h('div', { class: 'fila', style: 'align-items:flex-end;gap:18px' }, hayGrupos ? campoFormulario('¿Para cuántas personas?', personas) : null,
      campoFormulario('Día', h('div', { class: 'fila' }, atajos, fecha))),
    h('p', { class: 'suave' }, hayGrupos
      ? `Te asignamos automáticamente el lugar que mejor se ajuste (hasta ${comercio.capacidad_maxima} personas por reserva).`
      : 'Te asignamos automáticamente el lugar disponible.'),
    h('p', { class: 'suave' }, 'Horarios disponibles'), franjas,
    h('h2', {}, '3. ¿A nombre de quién?'),
    h('div', { class: 'fila' }, nombre, telefono, confirmar), mensaje, zonaIngreso);

  async function cargarFranjas() {
    reserva.inicio = null;
    confirmar.disabled = true;
    const consulta = new URLSearchParams({ servicio_id: reserva.servicio.id, fecha: fecha.value, personas: personas.value });
    try {
      const lista = await api(`/api/comercios/${slug}/disponibilidad?${consulta}`);
      const botonDeHorario = (franja) => h('button', {
        type: 'button',
        onclick: (evento) => {
          franjas.querySelectorAll('button').forEach((boton) => boton.classList.remove('elegida'));
          evento.currentTarget.classList.add('elegida');
          reserva.inicio = franja.inicio;
          confirmar.disabled = false;
          if (esMovil()) nombre.scrollIntoView({ behavior: 'smooth', block: 'center' });
        },
      }, franja.inicio.slice(11));
      franjas.replaceChildren(...(lista.length
        ? agruparPorPeriodoYHora(lista).map(({ titulo, filas }) => h('div', { class: 'periodo' }, h('h4', {}, titulo),
          ...filas.map(([hora, delaHora]) => h('div', { class: 'fila-hora' }, h('span', { class: 'hora-etiqueta' }, `${String(hora).padStart(2, '0')} h`),
            h('div', { class: 'franjas' }, delaHora.map(botonDeHorario))))))
        : [h('span', { class: 'suave' }, 'No hay lugar libre para esa cantidad de personas ese día.')]));
      return lista;
    } catch (error) { mostrarError(franjas, error); return []; }
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

  async function elegirServicio(servicio) {
    reserva.servicio = servicio;
    pasoReserva.hidden = false;
    pasoReserva.scrollIntoView({ behavior: 'smooth' });
    for (let dias = 0; dias <= DIAS_A_EXPLORAR; dias += 1) {
      fecha.value = fechaHoy(dias);
      marcarAtajos();
      if ((await cargarFranjas()).length) return;
    }
    fecha.value = fechaHoy();
    marcarAtajos();
    cargarFranjas();
  }

  fecha.addEventListener('change', () => { marcarAtajos(); cargarFranjas(); });
  personas.addEventListener('change', cargarFranjas);
  marcarAtajos();
  nombre.value = sesion.usuario?.nombre ?? '';

  const horarios = resumirHorarios(comercio.horarios);
  app.replaceChildren(
    h('a', { class: 'boton secundario', style: 'margin-bottom:10px', href: '/' }, '← Volver'),
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

function mostrarIngreso() {
  const desdeChat = Boolean(window.opener);
  const alIngresar = () => (desdeChat ? terminarIngreso() : (location.href = '/'));
  const terminarIngreso = () => app.replaceChildren(
    h('h1', { class: 'mensaje-ok' }, '¡Listo, ya ingresaste!'),
    h('p', {}, 'Volvé al chat para seguir con tu reserva.'),
    h('div', { class: 'fila' }, h('button', { onclick: () => window.close() }, 'Cerrar esta pestaña'), h('a', { class: 'boton secundario', href: '/' }, 'Ir al inicio')));
  app.replaceChildren(h('div', { class: 'seccion estrecha' }, h('h1', {}, 'Ingresá a tu cuenta'),
    formularioIngreso({ alIngresar, titulo: 'Usuario y contraseña' }), cuentasDePrueba({ alIngresar })));
}

await cargarSesion();
const slug = new URLSearchParams(location.search).get('c');
if (new URLSearchParams(location.search).has('ingresar') && !sesion.usuario) mostrarIngreso();
else if (slug) await mostrarComercio(slug);
else await mostrarBuscador();
