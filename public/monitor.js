import { h } from './dom.js';

const app = document.getElementById('app');
const RANGOS = [[1, 'Última hora'], [24, '24 horas'], [168, '7 días']];
const CLAVE_TOKEN = 'monitor_token';

const leerToken = () => { try { return sessionStorage.getItem(CLAVE_TOKEN) ?? ''; } catch { return ''; } };
const guardarToken = (token) => { try { sessionStorage.setItem(CLAVE_TOKEN, token); } catch { /* solo vale para esta pantalla */ } };

async function pedirResumen(horas) {
  const respuesta = await fetch(`/api/monitor/resumen?horas=${horas}`, { headers: { 'x-monitor-token': leerToken() } });
  if (!respuesta.ok) throw new Error(respuesta.status === 404 ? 'Token inválido' : `Error ${respuesta.status}`);
  return respuesta.json();
}

const tabla = (titulo, columnas, filas) => h('div', { class: 'tarjeta' },
  h('h3', {}, titulo),
  filas.length === 0 ? h('p', { class: 'suave' }, 'Sin datos todavía.') : h('table', {},
    h('thead', {}, h('tr', {}, ...columnas.map(([, nombre]) => h('th', {}, nombre)))),
    h('tbody', {}, ...filas.map((fila) => h('tr', {}, ...columnas.map(([clave]) => h('td', {}, String(fila[clave] ?? '')))))))); 

const cifra = (etiqueta, valor) => h('div', { class: 'tarjeta' }, h('div', { class: 'suave' }, etiqueta), h('h2', {}, String(valor ?? 0)));

function dibujar(resumen) {
  const { totales } = resumen;
  return h('div', {},
    h('div', { class: 'bloques' },
      cifra('Pedidos', totales.pedidos), cifra('Visitantes únicos', totales.visitantes),
      cifra('Errores 4xx', totales.errores_4xx), cifra('Errores 5xx', totales.errores_5xx),
      cifra('Bloqueados por límite', totales.limitados), cifra('Respuesta promedio (ms)', totales.ms_promedio)),
    tabla('Qué se busca', [['busqueda', 'Búsqueda'], ['veces', 'Veces']], resumen.busquedas),
    tabla('Rubros filtrados', [['rubro', 'Rubro'], ['veces', 'Veces']], resumen.rubros),
    tabla('Rutas más usadas', [['metodo', 'Método'], ['ruta', 'Ruta'], ['veces', 'Veces'], ['ms', 'ms']], resumen.rutas),
    tabla('Pedidos por hora (UTC)', [['hora', 'Hora'], ['pedidos', 'Pedidos']], resumen.porHora),
    tabla('Visitantes sospechosos', [['visitante', 'Visitante'], ['pedidos', 'Pedidos'], ['rechazos', '401/403'], ['no_encontrados', '404'], ['limitados', '429'], ['agente', 'Agente']], resumen.sospechosos));
}

async function mostrar(horas) {
  const contenido = h('div', {}, h('p', { class: 'suave' }, 'Cargando…'));
  app.replaceChildren(
    h('div', { class: 'fila' }, ...RANGOS.map(([valor, nombre]) => h('button', { type: 'button', class: valor === horas ? '' : 'secundario', onclick: () => mostrar(valor) }, nombre))),
    contenido);
  try { contenido.replaceChildren(dibujar(await pedirResumen(horas))); } catch (error) { pedirAcceso(error.message); }
}

function pedirAcceso(aviso = '') {
  const campo = h('input', { type: 'password', placeholder: 'Token del monitor', autocomplete: 'off', 'aria-label': 'Token del monitor' });
  app.replaceChildren(h('form', { class: 'tarjeta', onsubmit: (evento) => { evento.preventDefault(); guardarToken(campo.value); mostrar(24); } },
    h('h2', {}, 'Acceso restringido'), campo, h('button', { type: 'submit' }, 'Entrar'), h('span', { class: 'mensaje-error' }, aviso)));
}

if (leerToken()) mostrar(24); else pedirAcceso();
