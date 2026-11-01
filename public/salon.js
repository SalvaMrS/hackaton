import { h, api, mostrarError, campoImagen, grupoBotones, campoFormulario, esMovil, etiquetarTablas } from './dom.js';
import { crearLienzo, LEYENDA } from './lienzo.js';

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
    h('strong', {}, turno.cliente_nombre), h('div', { class: 'suave' }, `${turno.servicio} · ${turno.personas} pers. · ${turno.inicio.slice(11)}`),
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
    ['lat', 'Latitud', 'number'], ['lng', 'Longitud', 'number'], ['descripcion', 'Descripción', 'text'], ['imagen_url', 'Imagen de portada del comercio', 'imagen'],
    ['aviso_min', 'Avisar reservas próximas (min antes)', 'number'],
    ['tolerancia_min', 'Tolerancia: pasado este tiempo figura "demorado" (min)', 'number'],
    ['ausente_min', 'Marcar "no se presentó" tras (min)', 'number'],
  ];
  const entradas = Object.fromEntries(campos.map(([nombre, , tipo]) => [nombre, tipo === 'imagen' ? campoImagen() : h('input', { type: tipo, step: 'any', list: nombre === 'rubro' ? 'rubros-config' : null })]));
  const opcionesRubro = h('datalist', { id: 'rubros-config' });
  api('/api/rubros').then((rubros) => opcionesRubro.append(...rubros.map((valor) => h('option', { value: valor })))).catch(() => {});

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
      ...campos.map(([nombre, etiqueta]) => h('label', {}, etiqueta, entradas[nombre])), opcionesRubro, h('button', { type: 'submit' }, 'Guardar')), mensaje);
  return contenedor;
}

function textoEstadoPlaza(plaza) {
  if (plaza.estado === 'libre') return 'Libre en este momento';
  if (plaza.estado === 'inactiva') return 'Desactivada';
  const { turno } = plaza;
  if (plaza.estado === 'en_curso') return `Atendiendo a ${turno.cliente_nombre} (${textoSituacion(turno).toLowerCase()})`;
  return `${turno.cliente_nombre}: ${textoSituacion(turno).toLowerCase()}`;
}

function panelPlaza(plaza) {
  return h('div', { class: 'tarjeta' },
    h('h2', { style: 'margin-top:0' }, plaza.nombre),
    h('div', { class: 'fila' }, h('span', { class: 'etiqueta' }, plaza.tipo || 'plaza'), h('span', { class: 'etiqueta' }, `👥 capacidad ${plaza.capacidad}`)),
    plaza.descripcion && h('p', {}, plaza.descripcion),
    h('p', { class: `situacion-${plaza.estado}` }, h('strong', {}, 'Ahora: '), textoEstadoPlaza(plaza)),
    h('strong', {}, 'Turnos que vienen'),
    plaza.proximos?.length
      ? h('ul', { class: 'lista-proximos' }, ...plaza.proximos.map((turno) => h('li', {},
        `${turno.inicio.slice(11)}–${turno.fin.slice(11)} · ${turno.cliente_nombre} · ${turno.personas} pers.`,
        h('div', { class: `situacion-${turno.situacion}` }, textoSituacion(turno)))))
      : h('p', { class: 'suave' }, 'Sin turnos pendientes hoy.'));
}

function pintarLista(lista, plazas, seleccionada, alTocar) {
  lista.replaceChildren(...plazas.map((plaza) => h('button', {
    type: 'button', class: `plaza-item ${plaza.estado} ${plaza.id === seleccionada ? 'seleccionada' : ''}`, onclick: () => alTocar(plaza.id),
  }, h('span', { class: 'punto' }), h('span', { class: 'plaza-item-texto' },
    h('strong', {}, plaza.nombre),
    h('small', {}, `${plaza.tipo || 'plaza'} · 👥 ${plaza.capacidad}`),
    h('small', { class: `situacion-${plaza.estado}` }, textoEstadoPlaza(plaza))))));
}

function selectorDeVista(contenedor) {
  const aplicar = (vista) => { contenedor.classList.toggle('vista-lista', vista === 'lista'); contenedor.classList.toggle('vista-mapa', vista === 'mapa'); };
  aplicar(esMovil() ? 'lista' : 'mapa');
  const selector = grupoBotones([['lista', '📋 Lista'], ['mapa', '🗺️ Mapa']], esMovil() ? 'lista' : 'mapa');
  selector.classList.add('solo-movil');
  selector.addEventListener('change', () => aplicar(selector.value));
  return selector;
}

function llevarA(elemento) {
  if (esMovil()) elemento.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const leyenda = () => h('div', { class: 'leyenda' }, ...LEYENDA.map(([texto, color]) => h('span', { style: `--color:${color}` }, texto)));
const pistaPlaza = () => h('div', { class: 'tarjeta suave' }, 'Tocá una plaza para ver sus características y los turnos que vienen.');

export function seccionSalon() {
  const lateral = h('div', {}, pistaPlaza());
  const lista = h('div', { class: 'lista-plazas' });
  const contenedor = h('div', {});
  const lienzo = crearLienzo({
    alElegirPlaza: (plaza) => { lateral.replaceChildren(panelPlaza(plaza)); llevarA(lateral); },
    alActualizar: (plazas, seleccionada) => pintarLista(lista, plazas, seleccionada, (id) => lienzo.seleccionar(id)),
  });
  contenedor.append(h('h2', { style: 'margin-top:0' }, 'Salón en vivo'), selectorDeVista(contenedor), leyenda(), lienzo.mensaje,
    h('div', { class: 'dos-columnas' }, h('div', {}, lienzo.mapa, lista), lateral));
  return contenedor;
}

export function seccionPlazas() {
  let editando = false;
  let plazaEnFormulario = null;
  const lateral = h('div', {}, pistaPlaza());
  const mensaje = h('p');
  const lista = h('div', { class: 'lista-plazas' });
  const lienzo = crearLienzo({
    alElegirPlaza: elegir, mostrarInactivas: true,
    alActualizar: (plazas, seleccionada) => pintarLista(lista, plazas, seleccionada, (id) => lienzo.seleccionar(id)),
  });
  const interruptor = h('button', { onclick: alternarEdicion }, '✏ Habilitar edición');
  const botonLinea = h('button', { class: 'secundario', hidden: true, onclick: () => lienzo.agregarGuia() }, '＋ Línea guía');
  const botonNueva = h('button', { hidden: true, onclick: agregarRapido }, '＋ Nueva plaza');

  const entradas = {
    nombre: h('input', { required: true, maxlength: 80 }),
    tipo: h('input', { maxlength: 40, placeholder: 'mesa, silla, sillón…' }),
    capacidad: h('input', { type: 'number', min: 1, value: 2, required: true }),
    forma: grupoBotones([['circulo', '● Círculo / óvalo'], ['rectangulo', '▬ Rectángulo / cuadrado']]),
    ancho: h('input', { type: 'number', min: 3, max: 70, step: 0.5, value: 9 }),
    alto: h('input', { type: 'number', min: 3, max: 70, step: 0.5, value: 9 }),
    colorPropio: grupoBotones([[0, 'Según estado'], [1, 'Color propio']]),
    color: h('input', { type: 'color', value: '#3b82f6' }),
    descripcion: h('textarea', { rows: 3, maxlength: 500, placeholder: 'Ubicación, comodidades, restricciones…' }),
    activo: grupoBotones([[1, 'Disponible'], [0, 'Desactivada']]),
  };
  const titulo = h('strong', {}, 'Nueva plaza');
  const quitar = h('button', { type: 'button', class: 'peligro', hidden: true, onclick: quitarPlaza }, 'Quitar');
  const formulario = h('form', { class: 'tarjeta formulario', style: 'grid-template-columns:1fr', onsubmit: guardar },
    titulo, h('label', {}, 'Nombre', entradas.nombre), h('label', {}, 'Tipo', entradas.tipo),
    h('label', {}, 'Capacidad (personas)', entradas.capacidad), h('label', {}, 'Descripción', entradas.descripcion),
    campoFormulario('Forma', entradas.forma),
    h('div', { class: 'fila' }, h('label', {}, 'Ancho', entradas.ancho), h('label', {}, 'Alto', entradas.alto)),
    campoFormulario('Color', h('div', { class: 'fila' }, entradas.colorPropio, entradas.color)),
    h('p', { class: 'suave', style: 'margin:0' }, 'El borde sigue mostrando el estado (libre, ocupada…). También podés cambiar el tamaño arrastrando el cuadradito de la esquina.'),
    campoFormulario('Estado', entradas.activo),
    h('div', { class: 'fila' }, h('button', { type: 'submit' }, 'Guardar'),
      h('button', { type: 'button', class: 'secundario', onclick: () => cargarFormulario(null) }, 'Nueva'), quitar));

  function cargarFormulario(plaza) {
    plazaEnFormulario = plaza;
    titulo.textContent = plaza ? `Editar ${plaza.nombre}` : 'Nueva plaza';
    quitar.hidden = !plaza;
    entradas.nombre.value = plaza?.nombre ?? '';
    entradas.tipo.value = plaza?.tipo ?? '';
    entradas.capacidad.value = plaza?.capacidad ?? 2;
    entradas.descripcion.value = plaza?.descripcion ?? '';
    entradas.activo.value = plaza?.activo ?? 1;
    entradas.forma.value = plaza?.forma ?? 'circulo';
    entradas.ancho.value = plaza?.ancho ?? 9;
    entradas.alto.value = plaza?.alto ?? 9;
    entradas.colorPropio.value = plaza?.color ? 1 : 0;
    entradas.color.value = plaza?.color || '#3b82f6';
    if (!plaza) lienzo.deseleccionar();
  }

  function elegir(plaza) {
    if (editando) cargarFormulario(plaza); else lateral.replaceChildren(panelPlaza(plaza));
    llevarA(lateral);
  }

  function alternarEdicion() {
    editando = !editando;
    interruptor.textContent = editando ? '✔ Terminar edición' : '✏ Habilitar edición';
    botonLinea.hidden = !editando;
    botonNueva.hidden = !editando;
    lienzo.editar(editando);
    if (editando) { lateral.replaceChildren(formulario); cargarFormulario(null); } else lateral.replaceChildren(pistaPlaza());
  }

  async function crearEnEspacioLibre(cuerpo) {
    const creada = await api('/api/plazas', { metodo: 'POST', cuerpo });
    const { x, y } = lienzo.espacioLibre(cuerpo.ancho, cuerpo.alto);
    await api(`/api/plazas/${creada.id}/posicion`, { metodo: 'PATCH', cuerpo: { x, y } });
    await lienzo.recargar();
    return creada.id;
  }

  async function agregarRapido() {
    try {
      const id = await crearEnEspacioLibre({
        nombre: `Plaza ${lienzo.cantidad() + 1}`, tipo: '', descripcion: '', capacidad: 2, forma: 'circulo', ancho: 9, alto: 9, color: '', activo: 1,
      });
      mensaje.textContent = '';
      lienzo.seleccionar(id);
    } catch (error) { mostrarError(mensaje, error); }
  }

  async function guardar(evento) {
    evento.preventDefault();
    const cuerpo = {
      nombre: entradas.nombre.value, tipo: entradas.tipo.value, capacidad: Number(entradas.capacidad.value),
      descripcion: entradas.descripcion.value, activo: Number(entradas.activo.value),
      forma: entradas.forma.value, ancho: Number(entradas.ancho.value), alto: Number(entradas.alto.value),
      color: Number(entradas.colorPropio.value) === 1 ? entradas.color.value : '',
    };
    try {
      if (plazaEnFormulario) await api(`/api/plazas/${plazaEnFormulario.id}`, { metodo: 'PUT', cuerpo });
      else await crearEnEspacioLibre(cuerpo);
      mensaje.textContent = '';
      cargarFormulario(null);
      await lienzo.recargar();
    } catch (error) { mostrarError(mensaje, error); }
  }

  async function quitarPlaza() {
    try {
      await api(`/api/plazas/${plazaEnFormulario.id}`, { metodo: 'DELETE' });
      mensaje.textContent = '';
      cargarFormulario(null);
      await lienzo.recargar();
    } catch (error) { mostrarError(mensaje, error); }
  }

  const contenedor = h('div', {});
  contenedor.append(
    h('div', { class: 'fila' }, h('h2', { style: 'margin:0' }, 'Plazas'), interruptor, botonNueva, botonLinea), selectorDeVista(contenedor),
    h('p', { class: 'suave' }, 'Tocá una plaza para ver sus características. Con la edición habilitada podés crear plazas nuevas, editar las existentes, arrastrarlas, cambiar su tamaño y agregar líneas guía, todo desde acá.'),
    leyenda(), lienzo.mensaje, mensaje, h('div', { class: 'dos-columnas' }, h('div', {}, lienzo.mapa, lista), lateral));
  return contenedor;
}
