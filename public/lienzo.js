import { h, api, mostrarError } from './dom.js';

const NS_SVG = 'http://www.w3.org/2000/svg';
const UMBRAL_ARRASTRE_PX = 4;
const REFRESCO_MS = 10_000;
const LINEA_NUEVA = { x1: 30, y1: 50, x2: 70, y2: 50 };

export const LEYENDA = [
  ['Libre', '#10b981'], ['Reserva próxima', '#eab308'], ['Hora de llegada', '#f97316'],
  ['Demorado', '#dc2626'], ['No se presentó', '#6b7280'], ['En atención', '#4f46e5'],
];

function colorDeTexto(fondo) {
  const [rojo, verde, azul] = [1, 3, 5].map((inicio) => parseInt(fondo.slice(inicio, inicio + 2), 16));
  return (rojo * 299 + verde * 587 + azul * 114) / 1000 > 150 ? '#1b1f2a' : '#fff';
}

function limitar(valor, minimo, maximo) {
  return Math.min(maximo, Math.max(minimo, valor));
}

function porcentajes(evento, mapa) {
  const caja = mapa.getBoundingClientRect();
  return {
    x: limitar(((evento.clientX - caja.left) / caja.width) * 100, 3, 97),
    y: limitar(((evento.clientY - caja.top) / caja.height) * 100, 5, 95),
  };
}

function arrastrar(evento, elemento, { alMover, alSoltar, alTocar }) {
  elemento.setPointerCapture(evento.pointerId);
  const origen = { x: evento.clientX, y: evento.clientY };
  let movido = false;
  const mover = (movimiento) => {
    if (Math.hypot(movimiento.clientX - origen.x, movimiento.clientY - origen.y) > UMBRAL_ARRASTRE_PX) movido = true;
    if (movido) alMover(movimiento);
  };
  const soltar = () => {
    elemento.removeEventListener('pointermove', mover);
    elemento.removeEventListener('pointerup', soltar);
    if (movido) alSoltar(); else alTocar?.();
  };
  elemento.addEventListener('pointermove', mover);
  elemento.addEventListener('pointerup', soltar);
}

export function crearLienzo({ alElegirPlaza, mostrarInactivas = false }) {
  const mapa = h('div', { class: 'salon' });
  const capaGuias = document.createElementNS(NS_SVG, 'svg');
  capaGuias.setAttribute('class', 'guias');
  capaGuias.setAttribute('viewBox', '0 0 100 100');
  capaGuias.setAttribute('preserveAspectRatio', 'none');
  const mensaje = h('p');
  const estado = { plazas: [], guias: [], editando: false, ocupado: false, seleccionada: null };

  async function recargar() {
    if (estado.ocupado) return;
    try {
      const [plazas, guias] = await Promise.all([api(`/api/salon${mostrarInactivas ? '?todas=1' : ''}`), api('/api/guias')]);
      estado.plazas = plazas;
      estado.guias = guias;
      dibujar();
    } catch (error) { mostrarError(mensaje, error); }
  }

  function dibujar() {
    mapa.classList.toggle('editando', estado.editando);
    capaGuias.replaceChildren();
    mapa.replaceChildren(capaGuias);
    estado.guias.forEach(dibujarGuia);
    estado.plazas.forEach(dibujarPlaza);
    if (!estado.plazas.length) mapa.append(h('p', { class: 'suave', style: 'padding:20px' }, 'Todavía no hay plazas.'));
  }

  function dibujarPlaza(plaza) {
    const personalizada = Boolean(plaza.color) && plaza.estado !== 'inactiva';
    const circulo = h('div', {
      class: `plaza ${plaza.estado} ${personalizada ? 'personalizada' : ''} ${/cancha/i.test(plaza.tipo) ? 'cancha' : ''} ${estado.seleccionada === plaza.id ? 'seleccionada' : ''}`,
      style: estiloPlaza(plaza, personalizada), title: plaza.nombre,
    }, h('span', {}, plaza.nombre), h('small', {}, `👥 ${plaza.capacidad}`));
    if (estado.editando && estado.seleccionada === plaza.id) circulo.append(crearAsaTamano(plaza, circulo));
    circulo.addEventListener('pointerdown', (evento) => {
      const elegir = () => { estado.seleccionada = plaza.id; dibujar(); alElegirPlaza(plaza); };
      if (!estado.editando) { elegir(); return; }
      estado.ocupado = true;
      circulo.classList.add('arrastrando');
      arrastrar(evento, circulo, {
        alMover: (movimiento) => {
          Object.assign(plaza, porcentajes(movimiento, mapa));
          circulo.style.left = `${plaza.x}%`;
          circulo.style.top = `${plaza.y}%`;
        },
        alSoltar: async () => {
          estado.ocupado = false;
          circulo.classList.remove('arrastrando');
          try { await api(`/api/plazas/${plaza.id}/posicion`, { metodo: 'PATCH', cuerpo: { x: plaza.x, y: plaza.y } }); } catch (error) { mostrarError(mensaje, error); }
        },
        alTocar: () => { estado.ocupado = false; elegir(); },
      });
    });
    mapa.append(circulo);
  }

  function estiloPlaza(plaza, personalizada) {
    const color = personalizada ? `background-color:${plaza.color};color:${colorDeTexto(plaza.color)};` : '';
    const radio = plaza.forma === 'rectangulo' ? 'border-radius:10px;' : 'border-radius:50%;';
    return `left:${plaza.x}%;top:${plaza.y}%;width:${plaza.ancho}cqw;height:${plaza.alto}cqw;${radio}${color}`;
  }

  function crearAsaTamano(plaza, circulo) {
    const asa = h('div', { class: 'asa', title: 'Arrastrá para cambiar el tamaño' });
    asa.addEventListener('pointerdown', (evento) => {
      evento.stopPropagation();
      estado.ocupado = true;
      arrastrar(evento, asa, {
        alMover: (movimiento) => {
          const caja = mapa.getBoundingClientRect();
          const centroX = caja.left + (plaza.x / 100) * caja.width;
          const centroY = caja.top + (plaza.y / 100) * caja.height;
          plaza.ancho = Number(limitar((2 * Math.abs(movimiento.clientX - centroX) / caja.width) * 100, 3, 70).toFixed(1));
          plaza.alto = Number(limitar((2 * Math.abs(movimiento.clientY - centroY) / caja.width) * 100, 3, 70).toFixed(1));
          circulo.style.width = `${plaza.ancho}cqw`;
          circulo.style.height = `${plaza.alto}cqw`;
        },
        alSoltar: async () => {
          estado.ocupado = false;
          await guardarPlaza(plaza);
          alElegirPlaza(plaza);
        },
        alTocar: () => { estado.ocupado = false; },
      });
    });
    return asa;
  }

  async function guardarPlaza({ id, nombre, tipo, descripcion, forma, ancho, alto, color, capacidad, activo }) {
    try { await api(`/api/plazas/${id}`, { metodo: 'PUT', cuerpo: { nombre, tipo, descripcion, forma, ancho, alto, color, capacidad, activo } }); } catch (error) { mostrarError(mensaje, error); }
  }

  function dibujarGuia(guia) {
    const linea = document.createElementNS(NS_SVG, 'line');
    const actualizar = () => {
      linea.setAttribute('x1', guia.x1); linea.setAttribute('y1', guia.y1);
      linea.setAttribute('x2', guia.x2); linea.setAttribute('y2', guia.y2);
    };
    actualizar();
    capaGuias.append(linea);
    if (!estado.editando) return;

    const crearAsa = (clave) => {
      const asa = h('div', { class: 'asa', style: `left:${guia[`x${clave}`]}%;top:${guia[`y${clave}`]}%` });
      asa.addEventListener('pointerdown', (evento) => {
        estado.ocupado = true;
        arrastrar(evento, asa, {
          alMover: (movimiento) => {
            const { x, y } = porcentajes(movimiento, mapa);
            guia[`x${clave}`] = x; guia[`y${clave}`] = y;
            asa.style.left = `${x}%`; asa.style.top = `${y}%`;
            actualizar();
          },
          alSoltar: async () => {
            estado.ocupado = false;
            try { await api(`/api/guias/${guia.id}`, { metodo: 'PUT', cuerpo: guia }); } catch (error) { mostrarError(mensaje, error); }
          },
          alTocar: () => { estado.ocupado = false; },
        });
      });
      return asa;
    };
    const quitar = h('div', { class: 'asa quitar', title: 'Quitar línea', style: `left:${(guia.x1 + guia.x2) / 2}%;top:${(guia.y1 + guia.y2) / 2}%`,
      onclick: async () => { await api(`/api/guias/${guia.id}`, { metodo: 'DELETE' }); await recargar(); } }, '×');
    mapa.append(crearAsa(1), crearAsa(2), quitar);
  }

  async function agregarGuia() {
    try { await api('/api/guias', { metodo: 'POST', cuerpo: LINEA_NUEVA }); await recargar(); } catch (error) { mostrarError(mensaje, error); }
  }

  function editar(habilitado) {
    estado.editando = habilitado;
    dibujar();
  }

  recargar();
  const refresco = setInterval(() => { if (mapa.isConnected) recargar(); else clearInterval(refresco); }, REFRESCO_MS);
  function espacioLibre(ancho = 9, alto = 9) {
    const ALTO_MAPA_CQW = 56.25;
    const libre = (x, y) => estado.plazas.every((plaza) =>
      Math.abs(x - plaza.x) >= (plaza.ancho + ancho) / 2 + 1.5
      || Math.abs(((y - plaza.y) / 100) * ALTO_MAPA_CQW) >= (plaza.alto + alto) / 2 + 1.5);
    for (let y = 14; y <= 86; y += 12) {
      for (let x = 10; x <= 90; x += 10) if (libre(x, y)) return { x, y };
    }
    return { x: 50, y: 50 };
  }

  function seleccionar(id) {
    const plaza = estado.plazas.find((candidata) => candidata.id === id);
    if (!plaza) return;
    estado.seleccionada = id;
    dibujar();
    alElegirPlaza(plaza);
  }

  return { mapa, mensaje, recargar, editar, agregarGuia, espacioLibre, seleccionar, cantidad: () => estado.plazas.length, deseleccionar: () => { estado.seleccionada = null; dibujar(); } };
}
