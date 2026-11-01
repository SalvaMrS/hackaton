import { h, api, mostrarError } from './dom.js';

const LEYENDA = [
  ['libre', 'Libre', '#10b981'], ['proximo', 'Reserva próxima', '#eab308'], ['en_hora', 'Hora de llegada', '#f97316'],
  ['demorado', 'Demorado', '#dc2626'], ['ausente', 'No se presentó', '#6b7280'], ['en_curso', 'En atención', '#4f46e5'],
];
const UMBRAL_ARRASTRE_PX = 4;
const REFRESCO_MS = 10_000;

export function textoSituacion({ situacion, minutos }) {
  switch (situacion) {
    case 'proximo': return `Llega en ${minutos} min`;
    case 'en_hora': return minutos === 0 ? 'Es su hora de llegada' : `Su hora pasó hace ${minutos} min`;
    case 'demorado': return `Demorado: pasó la hora hace ${minutos} min`;
    case 'ausente': return `No se presentó (${minutos} min tarde)`;
    case 'en_curso': return `En atención hace ${minutos} min`;
    default: return '';
  }
}

export async function cambiarEstadoTurno(turnoId, estado) {
  await api(`/api/turnos/${turnoId}`, { metodo: 'PATCH', cuerpo: { estado } });
}

export function accionesDeTurno(turno, alCambiar) {
  const boton = (texto, estado, clase = 'secundario') => h('button', { class: clase, onclick: async () => {
    await cambiarEstadoTurno(turno.id, estado);
    alCambiar();
  } }, texto);
  return h('div', { class: 'fila' },
    turno.estado === 'confirmado' && boton('✔ Llegó', 'en_curso', ''),
    turno.estado === 'en_curso' && boton('Atendido (liberar)', 'atendido', ''),
    turno.estado === 'confirmado' && boton('No se presentó', 'ausente'),
    boton('Cancelar', 'cancelado', 'peligro'));
}

export function seccionSalon() {
  const mapa = h('div', { class: 'salon' });
  const detalle = h('div');
  const mensaje = h('p');
  const nombre = h('input', { placeholder: 'Ej: Mesa 5', required: true, maxlength: 80 });
  const capacidad = h('input', { type: 'number', min: 1, value: 2, style: 'width:90px' });
  const tipo = h('input', { placeholder: 'mesa, silla…', maxlength: 40, style: 'width:130px' });
  let plazas = [];
  let arrastrando = false;

  async function cargar() {
    if (arrastrando) return;
    try {
      plazas = await api('/api/salon');
      mapa.replaceChildren(...plazas.map(dibujarPlaza));
      if (!plazas.length) mapa.append(h('p', { class: 'suave', style: 'padding:20px' }, 'Agregá tu primera plaza con el formulario de arriba.'));
    } catch (error) { mostrarError(mensaje, error); }
  }

  function dibujarPlaza(plaza) {
    const circulo = h('div', { class: `plaza ${plaza.estado}`, style: `left:${plaza.x}%;top:${plaza.y}%`, title: plaza.nombre },
      h('span', {}, plaza.nombre), h('small', {}, `👥 ${plaza.capacidad}`));
    circulo.addEventListener('pointerdown', (evento) => empezarArrastre(evento, circulo, plaza));
    return circulo;
  }

  function empezarArrastre(evento, circulo, plaza) {
    circulo.setPointerCapture(evento.pointerId);
    const origen = { x: evento.clientX, y: evento.clientY };
    let movido = false;
    arrastrando = true;
    circulo.classList.add('arrastrando');

    const mover = (movimiento) => {
      if (Math.hypot(movimiento.clientX - origen.x, movimiento.clientY - origen.y) > UMBRAL_ARRASTRE_PX) movido = true;
      const caja = mapa.getBoundingClientRect();
      plaza.x = Math.min(96, Math.max(4, ((movimiento.clientX - caja.left) / caja.width) * 100));
      plaza.y = Math.min(94, Math.max(6, ((movimiento.clientY - caja.top) / caja.height) * 100));
      circulo.style.left = `${plaza.x}%`;
      circulo.style.top = `${plaza.y}%`;
    };
    const soltar = async () => {
      circulo.removeEventListener('pointermove', mover);
      circulo.removeEventListener('pointerup', soltar);
      circulo.classList.remove('arrastrando');
      arrastrando = false;
      if (!movido) return mostrarDetalle(plaza);
      try {
        await api(`/api/plazas/${plaza.id}/posicion`, { metodo: 'PATCH', cuerpo: { x: plaza.x, y: plaza.y } });
      } catch (error) { mostrarError(mensaje, error); }
    };
    circulo.addEventListener('pointermove', mover);
    circulo.addEventListener('pointerup', soltar);
  }

  function mostrarDetalle(plaza) {
    const { turno } = plaza;
    detalle.replaceChildren(h('div', { class: 'tarjeta' },
      h('strong', {}, `${plaza.nombre} · ${plaza.tipo || 'plaza'} · capacidad ${plaza.capacidad}`),
      turno ? h('div', {},
        h('p', {}, `${turno.cliente_nombre} · ${turno.personas} pers. · ${turno.inicio.slice(11)}–${turno.fin.slice(11)} · ${turno.servicio}`),
        h('p', { class: `situacion-${turno.situacion}` }, textoSituacion(turno)),
        accionesDeTurno(turno, () => { detalle.replaceChildren(); cargar(); }))
        : h('p', { class: 'suave' }, 'Libre en este momento.')));
  }

  async function agregar(evento) {
    evento.preventDefault();
    try {
      await api('/api/plazas', { metodo: 'POST', cuerpo: { nombre: nombre.value, tipo: tipo.value, capacidad: Number(capacidad.value) } });
      nombre.value = '';
      mensaje.textContent = '';
      await cargar();
    } catch (error) { mostrarError(mensaje, error); }
  }

  const contenedor = h('div', {},
    h('form', { class: 'fila', onsubmit: agregar }, h('strong', {}, 'Nueva plaza'), nombre, tipo,
      h('label', { style: 'flex-direction:row;align-items:center' }, '👥', capacidad), h('button', { type: 'submit' }, '+ Agregar')),
    mensaje,
    h('div', { class: 'leyenda' }, ...LEYENDA.map(([, texto, color]) => h('span', { style: `--color:${color}` }, texto))),
    h('p', { class: 'suave' }, 'Arrastrá los círculos para armar tu salón. Tocá uno para ver la reserva.'),
    mapa, detalle);
  cargar();
  const refresco = setInterval(() => { if (contenedor.isConnected) cargar(); else clearInterval(refresco); }, REFRESCO_MS);
  return contenedor;
}

export function seccionRecepcion() {
  const consulta = h('input', { type: 'search', placeholder: 'Nombre del cliente o código de reserva', style: 'flex:1;min-width:240px;font-size:1.1rem', autofocus: true });
  const resultados = h('div', { class: 'grilla', style: 'margin-top:14px' });
  let temporizador;

  async function buscar() {
    if (!consulta.value.trim()) return resultados.replaceChildren(h('p', { class: 'suave' }, 'Escribí el nombre o el código para ver a qué plaza ir.'));
    try {
      const turnos = await api(`/api/recepcion?q=${encodeURIComponent(consulta.value)}`);
      resultados.replaceChildren(...(turnos.length ? turnos.map(tarjetaTurno) : [h('p', { class: 'suave' }, 'No hay reservas activas con ese dato hoy.')]));
    } catch (error) { mostrarError(resultados, error); }
  }

  const tarjetaTurno = (turno) => h('div', { class: 'tarjeta' },
    h('div', { class: 'recepcion-destino' }, `Ir a: ${turno.plaza}`),
    h('strong', {}, turno.cliente_nombre), h('div', { class: 'suave' }, `${turno.servicio} · ${turno.personas} pers. · ${turno.inicio.slice(11)} · código ${turno.codigo}`),
    h('p', { class: `situacion-${turno.situacion}` }, textoSituacion(turno)),
    accionesDeTurno(turno, buscar));

  consulta.addEventListener('input', () => { clearTimeout(temporizador); temporizador = setTimeout(buscar, 250); });
  buscar();
  return h('div', {}, h('h2', { style: 'margin-top:0' }, 'Recepción'), h('div', { class: 'fila' }, consulta), resultados);
}

export function seccionConfiguracion() {
  const contenedor = h('div');
  const mensaje = h('p');
  const campos = [
    ['nombre', 'Nombre', 'text'], ['rubro', 'Rubro', 'text'], ['direccion', 'Dirección', 'text'], ['telefono', 'Teléfono', 'text'],
    ['lat', 'Latitud', 'number'], ['lng', 'Longitud', 'number'], ['descripcion', 'Descripción', 'text'],
    ['aviso_min', 'Avisar reservas próximas (min antes)', 'number'],
    ['tolerancia_min', 'Tolerancia: pasado este tiempo figura "demorado" (min)', 'number'],
    ['ausente_min', 'Marcar "no se presentó" tras (min)', 'number'],
  ];
  const entradas = Object.fromEntries(campos.map(([nombre, , tipo]) => [nombre, h('input', { type: tipo, step: 'any' })]));

  async function guardar(evento) {
    evento.preventDefault();
    const cuerpo = Object.fromEntries(campos.map(([nombre]) => [nombre, entradas[nombre].value]));
    try {
      await api('/api/comercio', { metodo: 'PUT', cuerpo });
      mensaje.className = 'mensaje-ok';
      mensaje.textContent = 'Cambios guardados.';
    } catch (error) { mostrarError(mensaje, error); }
  }

  api('/api/comercio').then((comercio) => {
    for (const [nombre] of campos) entradas[nombre].value = comercio[nombre] ?? '';
  }).catch((error) => mostrarError(mensaje, error));

  contenedor.append(h('h2', { style: 'margin-top:0' }, 'Configuración del comercio'),
    h('form', { class: 'formulario tarjeta', onsubmit: guardar },
      ...campos.map(([nombre, etiqueta]) => h('label', {}, etiqueta, entradas[nombre])), h('button', { type: 'submit' }, 'Guardar')), mensaje);
  return contenedor;
}
