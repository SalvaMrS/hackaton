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
  if (!respuesta.ok) throw Object.assign(new Error(datos.error?.message ?? 'Error inesperado'), { status: respuesta.status, code: datos.error?.code });
  return datos;
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
