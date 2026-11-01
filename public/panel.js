import { h, api, dinero, DIAS, fechaHoy, mostrarError, campoImagen } from './dom.js';
import { PLANTILLAS, plantillaPara } from './plantillas.js';
import { seccionSalon, seccionPlazas, seccionRecepcion, seccionConfiguracion } from './salon.js';

const app = document.getElementById('app');
const barra = document.getElementById('acciones-barra');

async function iniciar() {
  const { usuario, googleHabilitado } = await api('/api/yo');
  if (!usuario) return mostrarLogin(googleHabilitado);
  barra.replaceChildren(h('span', { class: 'suave' }, usuario.email),
    h('button', { class: 'secundario', onclick: async () => { await api('/api/auth/salir', { metodo: 'POST' }); location.reload(); } }, 'Salir'));
  if (!usuario.comercio_id) return await mostrarAlta();
  return mostrarPanel();
}

function mostrarLogin(googleHabilitado) {
  const email = h('input', { type: 'email', placeholder: 'tu@email.com', required: true });
  const password = h('input', { type: 'password', placeholder: 'Contraseña (mín. 6)', required: true });
  const mensaje = h('p');
  const enviar = (ruta) => async (evento) => {
    evento.preventDefault();
    try {
      await api(ruta, { metodo: 'POST', cuerpo: { email: email.value, password: password.value } });
      iniciar();
    } catch (error) { mostrarError(mensaje, error); }
  };
  app.replaceChildren(h('div', { class: 'tarjeta centrado' },
    h('h1', {}, 'Ingresá a tu comercio'),
    h('form', { class: 'formulario', style: 'grid-template-columns:1fr', onsubmit: enviar('/api/auth/login') },
      email, password,
      h('button', { type: 'submit' }, 'Ingresar'),
      h('button', { type: 'button', class: 'secundario', onclick: enviar('/api/auth/registro') }, 'Crear cuenta nueva')),
    googleHabilitado && h('a', { class: 'boton secundario', href: '/api/auth/google' }, 'Continuar con Google'),
    mensaje));
}

async function mostrarAlta() {
  const registrados = await api('/api/rubros').catch(() => []);
  const sugeridos = [...new Set([...registrados, ...Object.keys(PLANTILLAS).filter((clave) => clave !== 'otro')])];
  const rubro = h('input', { list: 'rubros', required: true, maxlength: 40, placeholder: 'Escribí tu rubro: peluquería, cancha de fútbol…', autocomplete: 'off' });
  const opcionesRubro = h('datalist', { id: 'rubros' }, ...sugeridos.map((valor) => h('option', { value: valor })));
  const campos = {
    nombre: h('input', { required: true, maxlength: 80 }),
    direccion: h('input', { maxlength: 200 }),
    telefono: h('input', { maxlength: 40 }),
    lat: h('input', { type: 'number', step: 'any' }),
    lng: h('input', { type: 'number', step: 'any' }),
  };
  const mensaje = h('p');
  const usarUbicacion = () => navigator.geolocation.getCurrentPosition(({ coords }) => {
    campos.lat.value = coords.latitude.toFixed(5);
    campos.lng.value = coords.longitude.toFixed(5);
  });

  async function crear(evento) {
    evento.preventDefault();
    try {
      await api('/api/comercio', { metodo: 'POST', cuerpo: {
        nombre: campos.nombre.value, rubro: rubro.value, direccion: campos.direccion.value, telefono: campos.telefono.value,
        lat: campos.lat.value, lng: campos.lng.value } });
      await cargarPlantilla(plantillaPara(rubro.value));
      iniciar();
    } catch (error) { mostrarError(mensaje, error); }
  }

  app.replaceChildren(h('div', { class: 'tarjeta centrado', style: 'max-width:520px' },
    h('h1', {}, 'Creá tu comercio'),
    h('p', { class: 'suave' }, 'Si tu rubro es conocido te cargamos servicios, plazas y horarios de ejemplo para que edites.'),
    h('form', { class: 'formulario', style: 'grid-template-columns:1fr', onsubmit: crear },
      h('label', {}, 'Nombre', campos.nombre), h('label', {}, 'Rubro (escribilo o elegí uno existente)', rubro, opcionesRubro),
      h('label', {}, 'Dirección', campos.direccion), h('label', {}, 'Teléfono', campos.telefono),
      h('div', { class: 'fila' }, h('label', {}, 'Latitud', campos.lat), h('label', {}, 'Longitud', campos.lng),
        h('button', { type: 'button', class: 'secundario', onclick: usarUbicacion }, '📍 Usar mi ubicación')),
      h('button', { type: 'submit' }, 'Crear comercio')), mensaje));
}

async function cargarPlantilla({ servicios, plazas, dias, apertura, cierre }) {
  for (const servicio of servicios) await api('/api/servicios', { metodo: 'POST', cuerpo: servicio });
  for (const plaza of plazas) await api('/api/plazas', { metodo: 'POST', cuerpo: plaza });
  for (const dia of dias) await api('/api/horarios', { metodo: 'POST', cuerpo: { dia_semana: dia, apertura, cierre } });
}

function seccionCrud({ ruta, titulo, campos, columnas }) {
  const contenedor = h('div');
  const mensaje = h('p');
  let editandoId = null;

  const entradas = Object.fromEntries(campos.map((campo) => {
    const entrada = campo.tipo === 'imagen' ? campoImagen() : campo.opciones
      ? h('select', {}, ...campo.opciones.map(([valor, texto]) => h('option', { value: valor }, texto)))
      : h('input', { type: campo.tipo ?? 'text', value: campo.inicial ?? '', min: campo.min, step: campo.paso, required: campo.requerido, list: campo.lista });
    return [campo.nombre, entrada];
  }));

  const aApi = (campo, valor) => (campo.escala ? Math.round(Number(valor) * campo.escala) : campo.tipo === 'number' || campo.opciones ? Number(valor) : valor);
  const deApi = (campo, valor) => (campo.escala ? valor / campo.escala : valor);

  const guardar = h('button', { type: 'submit' }, 'Guardar');
  const cancelar = h('button', { type: 'button', class: 'secundario', hidden: true, onclick: limpiar }, 'Cancelar');
  const formulario = h('form', { class: 'formulario tarjeta', onsubmit: enviar },
    ...campos.map((campo) => h('label', {}, campo.etiqueta, entradas[campo.nombre])), h('div', { class: 'fila' }, guardar, cancelar));
  const tabla = h('div');

  function limpiar() {
    editandoId = null;
    formulario.reset();
    campos.filter((campo) => campo.tipo === 'imagen').forEach((campo) => { entradas[campo.nombre].value = ''; });
    guardar.textContent = 'Guardar';
    cancelar.hidden = true;
  }

  async function enviar(evento) {
    evento.preventDefault();
    const cuerpo = Object.fromEntries(campos.map((campo) => [campo.nombre, aApi(campo, entradas[campo.nombre].value)]));
    try {
      await api(editandoId ? `${ruta}/${editandoId}` : ruta, { metodo: editandoId ? 'PUT' : 'POST', cuerpo });
      mensaje.textContent = '';
      limpiar();
      await cargar();
    } catch (error) { mostrarError(mensaje, error); }
  }

  function editar(fila) {
    editandoId = fila.id;
    for (const campo of campos) entradas[campo.nombre].value = deApi(campo, fila[campo.nombre]);
    guardar.textContent = 'Actualizar';
    cancelar.hidden = false;
    formulario.scrollIntoView({ behavior: 'smooth' });
  }

  async function borrar(fila) {
    try { await api(`${ruta}/${fila.id}`, { metodo: 'DELETE' }); mensaje.textContent = ''; await cargar(); } catch (error) { mostrarError(mensaje, error); }
  }

  async function cargar() {
    const filas = await api(ruta);
    tabla.replaceChildren(filas.length ? h('table', {},
      h('thead', {}, h('tr', {}, ...columnas.map((columna) => h('th', {}, columna.etiqueta)), h('th'))),
      h('tbody', {}, ...filas.map((fila) => h('tr', {}, ...columnas.map((columna) => h('td', {}, columna.mostrar(fila))),
        h('td', { class: 'fila' }, h('button', { class: 'secundario', onclick: () => editar(fila) }, 'Editar'),
          h('button', { class: 'peligro', onclick: () => borrar(fila) }, 'Borrar')))))) : h('p', { class: 'suave' }, 'Todavía no cargaste nada.'));
  }

  contenedor.append(h('h2', { style: 'margin-top:0' }, titulo), formulario, mensaje, tabla);
  cargar();
  return contenedor;
}

function seccionAgenda() {
  const fecha = h('input', { type: 'date', value: fechaHoy() });
  const tabla = h('div');
  const mensaje = h('p');

  async function cambiarEstado(turno, estado) {
    try { await api(`/api/turnos/${turno.id}`, { metodo: 'PATCH', cuerpo: { estado } }); cargar(); } catch (error) { mostrarError(mensaje, error); }
  }

  async function cargar() {
    const turnos = await api(`/api/turnos?fecha=${fecha.value}`);
    tabla.replaceChildren(turnos.length ? h('table', {},
      h('thead', {}, h('tr', {}, ...['Hora', 'Cliente', 'Servicio', 'Plaza', 'Pers.', 'Código', 'Estado', ''].map((texto) => h('th', {}, texto)))),
      h('tbody', {}, ...turnos.map((turno) => h('tr', {},
        h('td', {}, `${turno.inicio.slice(11)}–${turno.fin.slice(11)}`),
        h('td', {}, turno.cliente_nombre, turno.cliente_telefono && h('div', { class: 'suave' }, turno.cliente_telefono)),
        h('td', {}, turno.servicio), h('td', {}, turno.plaza), h('td', {}, turno.personas), h('td', {}, turno.codigo),
        h('td', {}, h('span', { class: `etiqueta ${turno.estado}` }, turno.estado)),
        h('td', { class: 'fila' },
          turno.estado === 'confirmado' && h('button', { class: 'secundario', onclick: () => cambiarEstado(turno, 'en_curso') }, 'Llegó'),
          ['confirmado', 'en_curso'].includes(turno.estado) && h('button', { class: 'secundario', onclick: () => cambiarEstado(turno, 'atendido') }, 'Atendido'),
          ['confirmado', 'en_curso'].includes(turno.estado) && h('button', { class: 'peligro', onclick: () => cambiarEstado(turno, 'cancelado') }, 'Cancelar')))))
    ) : h('p', { class: 'suave' }, 'No hay turnos para este día.'));
  }

  fecha.addEventListener('change', cargar);
  const contenedor = h('div', {}, h('div', { class: 'fila' }, h('h2', { style: 'margin:0' }, 'Turnos del día'), fecha,
    h('button', { class: 'secundario', onclick: cargar }, '↻ Actualizar')), mensaje, tabla);
  cargar();
  const refresco = setInterval(() => { if (contenedor.isConnected) cargar(); else clearInterval(refresco); }, 15_000);
  return contenedor;
}

function conTiposDePlaza(seccion) {
  const tipos = h('datalist', { id: 'tipos-plaza' });
  api('/api/plazas').then((plazas) => {
    const unicos = [...new Set(plazas.map((plaza) => plaza.tipo).filter(Boolean))];
    tipos.append(...unicos.map((tipo) => h('option', { value: tipo })));
  }).catch(() => {});
  seccion.append(tipos);
  return seccion;
}

const SECCIONES = {
  Salón: seccionSalon,
  Recepción: seccionRecepcion,
  Agenda: seccionAgenda,
  Servicios: () => conTiposDePlaza(seccionCrud({
    ruta: '/api/servicios', titulo: 'Catálogo de servicios',
    campos: [
      { nombre: 'nombre', etiqueta: 'Nombre', requerido: true },
      { nombre: 'precio_centavos', etiqueta: 'Precio ($)', tipo: 'number', escala: 100, inicial: 0, min: 0 },
      { nombre: 'duracion_min', etiqueta: 'Duración (min)', tipo: 'number', inicial: 30, min: 5, requerido: true },
      { nombre: 'caracteristicas', etiqueta: 'Características' },
      { nombre: 'descripcion', etiqueta: 'Descripción' },
      { nombre: 'imagen_url', etiqueta: 'Imagen del servicio', tipo: 'imagen' },
      { nombre: 'tipo_plaza', etiqueta: 'Plaza que usa (tipo, opcional)', lista: 'tipos-plaza' },
      { nombre: 'oferta', etiqueta: 'En oferta', opciones: [[0, 'No'], [1, 'Sí']] },
      { nombre: 'precio_oferta_centavos', etiqueta: 'Precio de oferta ($)', tipo: 'number', escala: 100, inicial: 0, min: 0 },
      { nombre: 'activo', etiqueta: 'Visible', opciones: [[1, 'Sí'], [0, 'No']] },
    ],
    columnas: [
      { etiqueta: '', mostrar: (fila) => (fila.imagen_url ? h('img', { src: fila.imagen_url, alt: '', style: 'width:48px;height:36px;object-fit:cover;border-radius:6px' }) : '') },
      { etiqueta: 'Servicio', mostrar: (fila) => fila.nombre },
      { etiqueta: 'Precio', mostrar: (fila) => (fila.oferta
        ? h('span', {}, h('span', { class: 'precio-tachado' }, dinero(fila.precio_centavos)), h('span', { class: 'precio-oferta' }, dinero(fila.precio_oferta_centavos)), ' ', h('span', { class: 'etiqueta' }, 'OFERTA'))
        : dinero(fila.precio_centavos)) },
      { etiqueta: 'Duración', mostrar: (fila) => `${fila.duracion_min} min` }, { etiqueta: 'Características', mostrar: (fila) => fila.caracteristicas },
      { etiqueta: 'Visible', mostrar: (fila) => (fila.activo ? 'Sí' : 'No') },
    ],
  })),
  Plazas: seccionPlazas,
  Configuración: seccionConfiguracion,
  Horarios: () => seccionCrud({
    ruta: '/api/horarios', titulo: 'Horarios de atención',
    campos: [
      { nombre: 'dia_semana', etiqueta: 'Día', opciones: DIAS.map((dia, indice) => [indice, dia]) },
      { nombre: 'apertura', etiqueta: 'Apertura', tipo: 'time', inicial: '09:00', requerido: true },
      { nombre: 'cierre', etiqueta: 'Cierre', tipo: 'time', inicial: '18:00', requerido: true },
    ],
    columnas: [
      { etiqueta: 'Día', mostrar: (fila) => DIAS[fila.dia_semana] }, { etiqueta: 'Apertura', mostrar: (fila) => fila.apertura },
      { etiqueta: 'Cierre', mostrar: (fila) => fila.cierre },
    ],
  }),
};

async function mostrarPanel() {
  const comercio = await api('/api/comercio');
  const contenido = h('div');
  const pestanas = h('div', { class: 'pestanas' });

  function activar(nombre) {
    pestanas.querySelectorAll('button').forEach((boton) => boton.classList.toggle('activa', boton.textContent === nombre));
    contenido.replaceChildren(SECCIONES[nombre]());
  }

  pestanas.append(...Object.keys(SECCIONES).map((nombre) => h('button', { onclick: () => activar(nombre) }, nombre)));
  app.replaceChildren(
    h('h1', {}, comercio.nombre),
    h('p', { class: 'suave' }, 'Tu página pública: ', h('a', { href: `/?c=${comercio.slug}`, target: '_blank' }, `/?c=${comercio.slug}`)),
    pestanas, contenido);
  activar('Salón');
}

iniciar().catch((error) => mostrarError(app, error));
