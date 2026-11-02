export function h(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [nombre, valor] of Object.entries(atributos)) {
    if (nombre.startsWith('on')) nodo.addEventListener(nombre.slice(2), valor);
    else if (valor === true) nodo.setAttribute(nombre, '');
    else if (valor !== false && valor != null) nodo.setAttribute(nombre, valor);
  }
  nodo.append(...hijos.flat().filter((hijo) => hijo != null && hijo !== false));
  return nodo;
}

export async function api(ruta, { metodo = 'GET', cuerpo } = {}) {
  const respuesta = await fetch(ruta, {
    method: metodo,
    headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (respuesta.status === 204) return null;
  const datos = await respuesta.json().catch(() => ({}));
  if (respuesta.status === 401 && location.pathname === '/panel.html' && ruta !== '/api/auth/login') {
    location.reload();
    await new Promise(() => {});
  }
  if (!respuesta.ok) throw Object.assign(new Error(datos.error?.message ?? 'Error inesperado'), { status: respuesta.status, code: datos.error?.code });
  return datos;
}

export function botonGoogleDeshabilitado() {
  return h('div', { class: 'google-pendiente' },
    h('button', { type: 'button', class: 'secundario', disabled: true }, 'Continuar con Google'),
    h('span', { class: 'suave' }, 'Próximamente: ingreso con Google. Mientras tanto, usá tu correo y contraseña.'));
}

export const dinero = (centavos) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(centavos / 100);
export const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

export function fechaHoy(desplazamientoDias = 0) {
  const fecha = new Date(Date.now() + desplazamientoDias * 86_400_000);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(fecha);
}

export function mostrarError(contenedor, error) {
  contenedor.replaceChildren(h('p', { class: 'mensaje-error' }, error.message));
}

const LADO_MAXIMO_IMAGEN = 1280;

function reducirImagen(archivo) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error('No se pudo leer la imagen'));
    lector.onload = () => {
      const imagen = new Image();
      imagen.onerror = () => rechazar(new Error('El archivo no es una imagen válida'));
      imagen.onload = () => {
        const escala = Math.min(1, LADO_MAXIMO_IMAGEN / Math.max(imagen.width, imagen.height));
        const lienzo = document.createElement('canvas');
        lienzo.width = Math.round(imagen.width * escala);
        lienzo.height = Math.round(imagen.height * escala);
        lienzo.getContext('2d').drawImage(imagen, 0, 0, lienzo.width, lienzo.height);
        resolver(lienzo.toDataURL('image/jpeg', 0.82));
      };
      imagen.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

export async function subirImagen(archivo) {
  const { url } = await api('/api/imagenes', { metodo: 'POST', cuerpo: { imagen: await reducirImagen(archivo) } });
  return url;
}

export function campoImagen() {
  let url = '';
  const vista = h('img', { alt: '', style: 'max-width:120px;max-height:80px;border-radius:8px;display:none' });
  const mensaje = h('span', { class: 'mensaje-error' });
  const quitar = h('button', { type: 'button', class: 'secundario', style: 'display:none', onclick: () => { contenedor.value = ''; } }, 'Quitar');
  const archivo = h('input', { type: 'file', hidden: true, accept: 'image/png,image/jpeg,image/webp', onchange: async () => {
    mensaje.textContent = '';
    if (!archivo.files[0]) return;
    try { contenedor.value = await subirImagen(archivo.files[0]); } catch (error) { mensaje.textContent = error.message; }
    archivo.value = '';
  } });
  const subir = h('button', { type: 'button', class: 'secundario', onclick: () => archivo.click() }, '📷 Subir imagen');
  const contenedor = h('div', { class: 'fila' }, archivo, subir, vista, quitar, mensaje);
  Object.defineProperty(contenedor, 'value', {
    get: () => url,
    set: (valor) => {
      url = valor ?? '';
      vista.src = url;
      vista.style.display = url ? 'block' : 'none';
      quitar.style.display = url ? 'inline-block' : 'none';
    },
  });
  return contenedor;
}

export function grupoBotones(opciones, inicial = opciones[0][0]) {
  let actual = inicial;
  const botones = opciones.map(([valor, texto]) => h('button', { type: 'button', onclick: () => {
    contenedor.value = valor;
    contenedor.dispatchEvent(new Event('change'));
  } }, texto));
  const contenedor = h('div', { class: 'segmentado', role: 'group' }, ...botones);
  const pintar = () => botones.forEach((boton, indice) => boton.classList.toggle('activa', String(opciones[indice][0]) === String(actual)));
  Object.defineProperty(contenedor, 'value', { get: () => actual, set: (valor) => { actual = valor; pintar(); } });
  pintar();
  return contenedor;
}

export function contador({ min = 1, max = 99, valor = min } = {}) {
  let actual = valor;
  const pantalla = h('span', { class: 'contador-valor' }, String(actual));
  const menos = h('button', { type: 'button', class: 'secundario', 'aria-label': 'Menos', onclick: () => cambiar(-1) }, '−');
  const mas = h('button', { type: 'button', class: 'secundario', 'aria-label': 'Más', onclick: () => cambiar(1) }, '+');
  const contenedor = h('div', { class: 'contador' }, menos, pantalla, mas);
  const pintar = () => { pantalla.textContent = String(actual); menos.disabled = actual <= min; mas.disabled = actual >= max; };
  function cambiar(delta) {
    const nuevo = Math.min(max, Math.max(min, actual + delta));
    if (nuevo === actual) return;
    contenedor.value = nuevo;
    contenedor.dispatchEvent(new Event('change'));
  }
  Object.defineProperty(contenedor, 'value', { get: () => actual, set: (valor) => { actual = Number(valor); pintar(); } });
  pintar();
  return contenedor;
}

export function campoFormulario(etiqueta, control) {
  const envoltorio = control.tagName === 'DIV' ? 'div' : 'label';
  return h(envoltorio, { class: envoltorio === 'div' ? 'campo' : '' }, etiqueta, control);
}

const CLAVE_UBICACION = 'ubicacion';

export function leerUbicacionGuardada() {
  try {
    const { lat, lng } = JSON.parse(localStorage.getItem(CLAVE_UBICACION)) ?? {};
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : { lat: null, lng: null };
  } catch {
    return { lat: null, lng: null };
  }
}

export function guardarUbicacion({ lat, lng, nombre = '' }) {
  try {
    localStorage.setItem(CLAVE_UBICACION, JSON.stringify({ lat, lng, nombre }));
  } catch { /* sin almacenamiento: se usa solo en esta pantalla */ }
}

export function formularioDireccion({ alObtener }) {
  const direccion = h('input', { type: 'text', placeholder: 'Tu dirección o barrio, ej: Pellegrini 1200, Rosario', maxlength: 150, style: 'flex:1;min-width:200px' });
  const mensaje = h('span', { class: 'mensaje-error' });
  return h('form', { class: 'fila', onsubmit: async (evento) => {
    evento.preventDefault();
    mensaje.textContent = '';
    try {
      const ubicacion = await api(`/api/geocodificar?q=${encodeURIComponent(direccion.value)}`);
      guardarUbicacion(ubicacion);
      alObtener(ubicacion);
    } catch (error) { mensaje.textContent = error.message; }
  } }, direccion, h('button', { type: 'submit' }, 'Usar esta dirección'), mensaje);
}

const MENSAJES_GEOLOCALIZACION = {
  1: 'Permiso denegado. Habilitá la ubicación para este sitio o escribí tu dirección.',
  2: 'No se pudo determinar tu ubicación. Probá escribiendo tu dirección.',
  3: 'La ubicación tardó demasiado. Probá de nuevo o escribí tu dirección.',
};

export function botonUbicacionAutomatica({ alObtener }) {
  const mensaje = h('span', { class: 'mensaje-error' });
  const boton = h('button', { type: 'button', class: 'secundario' }, '📍 Cerca de mí');
  if (!window.isSecureContext || !('geolocation' in navigator)) {
    boton.disabled = true;
    mensaje.textContent = 'Tu navegador no permite la ubicación automática.';
    return h('span', {}, boton, mensaje);
  }
  boton.onclick = () => {
    mensaje.textContent = '';
    boton.disabled = true;
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const ubicacion = { lat: Number(coords.latitude.toFixed(5)), lng: Number(coords.longitude.toFixed(5)), nombre: '' };
        guardarUbicacion(ubicacion);
        boton.disabled = false;
        alObtener(ubicacion);
      },
      (error) => {
        boton.disabled = false;
        mensaje.textContent = MENSAJES_GEOLOCALIZACION[error.code] ?? MENSAJES_GEOLOCALIZACION[2];
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };
  return h('span', {}, boton, mensaje);
}

const ICONOS_RUBRO = [
  ['peluquer', '✂️'], ['barber', '✂️'], ['restaurante', '🍽️'], ['consultorio', '🩺'], ['pilates', '🧘'], ['yoga', '🧘'], ['cancha', '⚽'],
  ['taller', '🔧'], ['gomer', '🛞'], ['lavadero', '🚗'], ['software', '💻'], ['desarroll', '💻'], ['veterinaria', '🐾'], ['spa', '💆'],
];

const sinTildes = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function iconoRubro(rubro) {
  const buscado = sinTildes(rubro);
  return ICONOS_RUBRO.find(([clave]) => buscado.includes(clave))?.[1] ?? '📍';
}

export function cuentasDePrueba({ alIngresar }) {
  const contenedor = h('div');
  api('/api/cuentas-prueba').then(({ activas, clave, cuentas }) => {
    if (!activas || !cuentas.length) return;
    const entrar = async (cuenta, boton) => {
      boton.disabled = true;
      try {
        await api('/api/auth/login', { metodo: 'POST', cuerpo: { email: cuenta.email, password: clave } });
        alIngresar(cuenta);
      } catch (error) { boton.disabled = false; mostrarError(mensaje, error); }
    };
    const mensaje = h('p');
    contenedor.append(h('div', { class: 'cuentas-prueba' },
      h('strong', {}, 'Cuentas de prueba'), h('span', { class: 'suave' }, `Un toque para entrar (clave: ${clave})`),
      h('div', { class: 'cuentas-grilla' }, ...cuentas.map((cuenta) => {
        const boton = h('button', { type: 'button', class: 'secundario', onclick: () => entrar(cuenta, boton) },
          h('span', {}, cuenta.slug ? iconoRubro(cuenta.rubro) : '🙋'), h('span', {}, cuenta.nombre));
        return boton;
      })), mensaje));
  }).catch(() => {});
  return contenedor;
}

export const esMovil = () => window.matchMedia('(max-width: 720px)').matches;

export function etiquetarTablas(contenedor) {
  for (const tabla of contenedor.querySelectorAll('table')) {
    const titulos = [...tabla.querySelectorAll('thead th')].map((titulo) => titulo.textContent.trim());
    tabla.querySelectorAll('tbody tr').forEach((fila) => [...fila.children].forEach((celda, indice) => { celda.dataset.label = titulos[indice] ?? ''; }));
  }
}

export function avisar(texto, tipo = 'ok') {
  let zona = document.getElementById('avisos');
  if (!zona) { zona = h('div', { id: 'avisos', 'aria-live': 'polite' }); document.body.append(zona); }
  const aviso = h('div', { class: `aviso ${tipo}`, role: 'status' }, texto);
  zona.append(aviso);
  setTimeout(() => aviso.remove(), 3200);
}
