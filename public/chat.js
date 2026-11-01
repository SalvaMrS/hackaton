import { h, api } from './dom.js';

export function iniciarChat({ obtenerContexto }) {
  const mensajes = [];
  const lista = h('div', { id: 'chat-mensajes' });
  const entrada = h('input', { placeholder: 'Escribí tu consulta…', autocomplete: 'off', maxlength: 500 });
  const enviar = h('button', { type: 'submit' }, 'Enviar');
  const formulario = h('form', { id: 'chat-form', onsubmit: alEnviar }, entrada, enviar);
  const panel = h('div', { id: 'chat-panel' }, lista, formulario);
  const boton = h('button', { id: 'chat-boton', onclick: () => panel.classList.toggle('abierto') }, '💬 Asistente');
  document.body.append(panel, boton);
  agregar('assistant', '¡Hola! Puedo ayudarte a encontrar un lugar, ver precios y horarios, o reservar un turno por vos.');

  function agregar(rol, texto) {
    lista.append(h('div', { class: `burbuja ${rol === 'user' ? 'usuario' : ''}` }, texto));
    lista.scrollTop = lista.scrollHeight;
  }

  async function alEnviar(evento) {
    evento.preventDefault();
    const texto = entrada.value.trim();
    if (!texto) return;
    entrada.value = '';
    agregar('user', texto);
    mensajes.push({ role: 'user', content: texto });
    enviar.disabled = true;
    try {
      const { respuesta } = await api('/api/chat', { metodo: 'POST', cuerpo: { mensajes, contexto: obtenerContexto() } });
      mensajes.push({ role: 'assistant', content: respuesta });
      agregar('assistant', respuesta);
    } catch (error) {
      mensajes.pop();
      agregar('assistant', `${error.message}. Mientras tanto podés reservar desde el buscador.`);
    } finally {
      enviar.disabled = false;
      entrada.focus();
    }
  }
}
