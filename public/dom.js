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
    h('span', { class: 'suave' }, 'Próximamente: el ingreso con Google queda pendiente de implementar porque el servidor aún no cuenta con certificado SSL (HTTPS), requisito de Google.'));
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
  const archivo = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', onchange: async () => {
    mensaje.textContent = '';
    if (!archivo.files[0]) return;
    try { contenedor.value = await subirImagen(archivo.files[0]); } catch (error) { mensaje.textContent = error.message; }
    archivo.value = '';
  } });
  const contenedor = h('div', { class: 'fila' }, archivo, vista, quitar, mensaje);
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
