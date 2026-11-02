import { h, api, mostrarError, grupoBotones, etiquetarTablas } from './dom.js';

const RANGOS = [['hoy', 'Hoy'], ['semana', 'Próximos 7 días'], ['todo', 'Todo']];
const FILTROS = [['todos', 'Todos'], ['ocupado', 'Ocupados'], ['falta', 'Faltan']];
const NOMBRES_DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const ESTADO_TEXTO = { ocupado: 'Ocupado', falta: 'Falta', cancelado: 'Cancelado', ausente: 'No se presentó' };

const tarjeta = (titulo, valor, color, nota) => h('div', { class: 'kpi', style: `--color:${color}` }, h('span', { class: 'kpi-titulo' }, titulo), h('strong', { class: 'kpi-valor' }, String(valor)), nota && h('span', { class: 'suave' }, nota));

function barraDeOcupacion({ ocupados, faltan }) {
  const base = ocupados + faltan;
  const porcentaje = base ? Math.round((ocupados / base) * 100) : 0;
  return h('div', { class: 'ocupacion' },
    h('div', { class: 'ocupacion-texto' }, h('strong', {}, `${porcentaje}% ocupado`), h('span', { class: 'suave' }, `${ocupados} de ${base} turnos activos`)),
    h('div', { class: 'ocupacion-barra', role: 'img', 'aria-label': `${porcentaje}% de los turnos ocupados` }, h('div', { style: `width:${porcentaje}%` })));
}

function graficoPorDia(dias) {
  const maximo = Math.max(1, ...dias.map(({ total }) => total));
  return h('div', { class: 'dias-barras' }, ...dias.map((dia) => {
    const etiqueta = `${NOMBRES_DIA[new Date(`${dia.fecha}T00:00:00Z`).getUTCDay()]} ${dia.fecha.slice(8)}`;
    return h('div', { class: 'dia-barra', title: `${dia.total} turnos: ${dia.ocupados} ocupados, ${dia.faltan} faltan` },
      h('span', { class: 'dia-total' }, String(dia.total)),
      h('div', { class: 'columna', style: `height:${Math.max(4, (dia.total / maximo) * 100)}%` },
        h('div', { class: 'tramo-ocupado', style: `flex:${dia.ocupados}` }), h('div', { class: 'tramo-falta', style: `flex:${dia.faltan}` }), h('div', { class: 'tramo-otro', style: `flex:${dia.cancelados + dia.ausentes}` })),
      h('span', { class: 'suave' }, etiqueta));
  }));
}

const listaRanking = (titulo, filas) => h('div', { class: 'tarjeta' }, h('h3', { style: 'margin-top:0' }, titulo),
  filas.length ? h('ol', { class: 'ranking' }, ...filas.map(({ nombre, total }) => h('li', {}, h('span', {}, nombre), h('b', {}, String(total))))) : h('p', { class: 'suave' }, 'Sin datos todavía.'));

export function seccionEstadisticas() {
  const contenido = h('div');
  const mensaje = h('p');
  const rango = grupoBotones(RANGOS, 'hoy');
  const filtro = grupoBotones(FILTROS, 'todos');
  const lista = h('div', { class: 'tabla-turnos' });
  let datos = null;

  function actualizarLista() {
    lista.replaceChildren(pintarTurnos());
    etiquetarTablas(lista);
  }

  function pintarTurnos() {
    const visibles = datos.turnos.filter(({ categoria }) => filtro.value === 'todos' || categoria === filtro.value);
    return visibles.length ? h('table', {},
      h('thead', {}, h('tr', {}, ...['Día', 'Hora', 'Cliente', 'Servicio', 'Plaza', 'Estado'].map((texto) => h('th', {}, texto)))),
      h('tbody', {}, ...visibles.map((turno) => h('tr', {},
        h('td', {}, turno.fecha), h('td', {}, `${turno.inicio.slice(11)}–${turno.fin.slice(11)}`), h('td', {}, turno.cliente_nombre), h('td', {}, turno.servicio), h('td', {}, turno.plaza),
        h('td', {}, h('span', { class: `etiqueta estado-${turno.categoria}` }, ESTADO_TEXTO[turno.categoria])))))) : h('p', { class: 'vacio-simple suave' }, 'No hay turnos en esta vista.');
  }

  function pintar() {
    const { totales } = datos;
    actualizarLista();
    contenido.replaceChildren(
      h('div', { class: 'kpis' },
        tarjeta('Turnos totales', totales.total, '#4f46e5'), tarjeta('Ocupados', totales.ocupados, '#10b981', 'atendidos o en atención'),
        tarjeta('Faltan', totales.faltan, '#f59e0b', 'confirmados por atender'), tarjeta('Cancelados', totales.cancelados, '#6b7280'), tarjeta('No se presentaron', totales.ausentes, '#dc2626')),
      barraDeOcupacion(totales),
      h('div', { class: 'tarjeta' }, h('h3', { style: 'margin-top:0' }, 'Próximos 7 días'),
        graficoPorDia(datos.por_dia), h('div', { class: 'leyenda' }, h('span', { style: '--color:#10b981' }, 'Ocupados'), h('span', { style: '--color:#f59e0b' }, 'Faltan'), h('span', { style: '--color:#9ca3af' }, 'Cancelados o ausentes'))),
      h('div', { class: 'dos-listas' }, listaRanking('Servicios más pedidos', datos.por_servicio), listaRanking('Plazas más usadas', datos.por_plaza)),
      h('h3', {}, 'Detalle de turnos'), filtro, lista,
      h('p', { class: 'suave' }, `Acumulado general: ${datos.generales.total} turnos, ${datos.generales.ocupados} ocupados y ${datos.generales.faltan} por atender.`));
  }

  async function cargar() {
    try { datos = await api(`/api/estadisticas?rango=${rango.value}`); mensaje.textContent = ''; pintar(); } catch (error) { mostrarError(mensaje, error); }
  }

  rango.addEventListener('change', cargar);
  filtro.addEventListener('change', () => datos && actualizarLista());
  cargar();
  return h('div', {}, h('div', { class: 'fila' }, h('h2', { style: 'margin:0' }, 'Estadísticas'), rango, h('button', { class: 'secundario', onclick: cargar }, '↻ Actualizar')), mensaje, contenido);
}
