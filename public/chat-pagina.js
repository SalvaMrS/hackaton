import { h, api, leerUbicacionGuardada, formularioDireccion } from "./dom.js";

const identidad = await api("/api/chat/identidad").catch(() => ({ ahora: "", cliente: null }));

function mensajeInicial() {
  const [dia, , hora] = identidad.ahora.split(" ");
  const nombrePila = identidad.cliente?.nombre.split(" ")[0];
  const saludo = nombrePila ? `¡Hola ${nombrePila}! 👋` : "¡Hola! 👋";
  const momento = hora ? ` Son las ${hora} del ${dia}.` : "";
  return `${saludo}${momento} Soy el asistente de turnos: busco lugares cerca tuyo, te muestro precios y horarios libres, y reservo o cancelo por vos.`;
}
const RESPUESTAS_RAPIDAS = [
  "Busco un turno cerca mío",
  "Ver mis turnos",
  "¿Qué ofertas hay?",
  "Cancelar un turno",
];
const FORMATO_OPCIONES = /\n?\[Opciones:\s*([^\]]+)\]\s*$/i;
const FORMATO_NEGRITA = /(\*[^*\n]+\*)/;
const CLAVE_GUARDADO = "chat-mensajes-v2";
const ALTURA_MAXIMA_ENTRADA = 98;
const NS_SVG = "http://www.w3.org/2000/svg";

function leerGuardados() {
  try {
    const datos = JSON.parse(sessionStorage.getItem(CLAVE_GUARDADO));
    return Array.isArray(datos) ? datos : null;
  } catch {
    return null;
  }
}

const guardados = leerGuardados();
const conversacionRestaurada = Boolean(guardados?.length);
const mensajes = conversacionRestaurada ? guardados : [{ role: "assistant", content: mensajeInicial() }];

let enviando = false;
let indicadorEscribiendo = null;
let chips = null;

const contenedor = document.getElementById("mensajes");
const formulario = document.getElementById("formulario");
const entrada = document.getElementById("entrada");
const botonEnviar = document.getElementById("enviar");

function guardarMensajes() {
  try {
    sessionStorage.setItem(CLAVE_GUARDADO, JSON.stringify(mensajes));
  } catch {
    return;
  }
}

function horaActual() {
  const ahora = new Date();
  return `${String(ahora.getHours()).padStart(2, "0")}:${String(ahora.getMinutes()).padStart(2, "0")}`;
}

function esVisible(mensaje) {
  return typeof mensaje.content === "string" && mensaje.role !== "tool";
}

function separarOpciones(contenido) {
  const coincidencia = FORMATO_OPCIONES.exec(contenido);
  if (!coincidencia) return { texto: contenido, opciones: [] };
  const opciones = coincidencia[1].split("|").map((opcion) => opcion.trim()).filter(Boolean);
  return { texto: contenido.slice(0, coincidencia.index).trimEnd(), opciones };
}

function textoConFormato(contenido) {
  return contenido.split(FORMATO_NEGRITA).map((parte) => (
    parte.length > 2 && parte.startsWith("*") && parte.endsWith("*")
      ? h("strong", {}, parte.slice(1, -1))
      : document.createTextNode(parte.replace(/\*/g, "").replace(/^- /gm, "• "))
  ));
}

function crearBurbuja(mensaje) {
  const texto = h("span", { class: "texto" });
  texto.append(...textoConFormato(separarOpciones(mensaje.content).texto));
  const hora = h("span", { class: "hora" }, horaActual());
  if (mensaje.role === "user") hora.append(h("span", { class: "tilde" }, "✓✓"));
  const clase = mensaje.role === "user" ? "burbuja usuario" : "burbuja asistente";
  return h("div", { class: clase }, texto, hora);
}

function desplazarAlFinal() {
  contenedor.scrollTop = contenedor.scrollHeight;
}

function agregarMensaje(mensaje) {
  contenedor.append(crearBurbuja(mensaje));
  desplazarAlFinal();
}

function mostrarChips(opciones = RESPUESTAS_RAPIDAS) {
  ocultarChips();
  if (!opciones.length) return;
  chips = h("div", { class: "chips" });
  for (const texto of opciones) {
    chips.append(h("button", { type: "button", class: "chip", onclick: () => enviar(texto) }, texto));
  }
  contenedor.append(chips);
}

function ocultarChips() {
  chips?.remove();
  chips = null;
}

function mostrarEscribiendo() {
  indicadorEscribiendo = h(
    "div",
    { class: "burbuja asistente escribiendo", "aria-label": "Escribiendo" },
    h("span", {}, "escribiendo..."),
    h("span", { class: "puntos" }, h("span"), h("span"), h("span")),
  );
  contenedor.append(indicadorEscribiendo);
  desplazarAlFinal();
}

function ocultarEscribiendo() {
  indicadorEscribiendo?.remove();
  indicadorEscribiendo = null;
}

function crearIconoEnviar() {
  const icono = document.createElementNS(NS_SVG, "svg");
  icono.setAttribute("viewBox", "0 0 24 24");
  icono.setAttribute("aria-hidden", "true");
  const flecha = document.createElementNS(NS_SVG, "path");
  flecha.setAttribute("d", "M2.01 21 23 12 2.01 3 2 10l15 2-15 2z");
  icono.append(flecha);
  return icono;
}

const estado = document.getElementById("estado");

function mostrarDireccion() {
  estado.replaceChildren(
    h("span", {}, "Escribí tu dirección o barrio:"),
    formularioDireccion({ alObtener: () => actualizarEstado() }),
    h("button", { type: "button", onclick: () => actualizarEstado() }, "Cancelar"),
  );
}

async function actualizarEstado() {
  const { cliente } = await api("/api/chat/identidad").catch(() => ({ cliente: null }));
  const conUbicacion = leerUbicacion().lat != null;
  estado.replaceChildren(
    cliente
      ? h("span", { class: "ok" }, `📱 ${cliente.nombre} · ${cliente.telefono || "sin teléfono"}`)
      : h("button", { type: "button", onclick: () => window.open("/?ingresar=1", "_blank") }, "Ingresar para reservar"),
    conUbicacion ? h("span", { class: "ok" }, "📍 Ubicación activada") : h("button", { type: "button", disabled: true, title: "Requiere HTTPS (certificado SSL)" }, "📍 Ubicación automática (requiere SSL)"),
    h("button", { type: "button", onclick: mostrarDireccion }, conUbicacion ? "Cambiar dirección" : "✏️ Escribir mi dirección"),
  );
}

const leerUbicacion = leerUbicacionGuardada;

function obtenerContexto() {
  return {
    slug: new URLSearchParams(location.search).get("c") || null,
    ...leerUbicacion(),
  };
}

function ajustarAltura() {
  entrada.style.height = "auto";
  const alto = Math.min(entrada.scrollHeight, ALTURA_MAXIMA_ENTRADA);
  entrada.style.height = `${alto}px`;
  entrada.style.overflowY = entrada.scrollHeight > ALTURA_MAXIMA_ENTRADA ? "auto" : "hidden";
}

async function enviar(texto) {
  const contenido = texto.trim();
  if (!contenido || enviando) return;

  ocultarChips();
  const mensajeUsuario = { role: "user", content: contenido };
  mensajes.push(mensajeUsuario);
  agregarMensaje(mensajeUsuario);
  guardarMensajes();
  entrada.value = "";
  ajustarAltura();

  enviando = true;
  botonEnviar.disabled = true;
  mostrarEscribiendo();

  try {
    const { respuesta, historial = [] } = await api("/api/chat", {
      metodo: "POST",
      cuerpo: { mensajes, contexto: obtenerContexto() },
    });
    mensajes.push(...historial);
    const mensajeAsistente = { role: "assistant", content: respuesta };
    mensajes.push(mensajeAsistente);
    guardarMensajes();
    ocultarEscribiendo();
    agregarMensaje(mensajeAsistente);
    mostrarChips(separarOpciones(respuesta).opciones);
  } catch (error) {
    mensajes.pop();
    guardarMensajes();
    ocultarEscribiendo();
    agregarMensaje({ role: "assistant", content: error.message });
  } finally {
    enviando = false;
    botonEnviar.disabled = false;
    entrada.focus();
  }
}

function iniciar() {
  document.title = "Asistente de turnos";
  document.querySelector(".datos p").textContent = identidad.cliente ? `escribís como ${identidad.cliente.nombre}` : "en línea";
  botonEnviar.append(crearIconoEnviar());
  for (const mensaje of mensajes.filter(esVisible)) contenedor.append(crearBurbuja(mensaje));
  const ultimo = mensajes.filter(esVisible).at(-1);
  if (!conversacionRestaurada) mostrarChips();
  else if (ultimo.role === "assistant") mostrarChips(separarOpciones(ultimo.content).opciones);
  actualizarEstado();
  window.addEventListener("focus", actualizarEstado);
  guardarMensajes();
  ajustarAltura();
  desplazarAlFinal();
}

formulario.addEventListener("submit", (evento) => {
  evento.preventDefault();
  enviar(entrada.value);
});

entrada.addEventListener("keydown", (evento) => {
  if (evento.key === "Enter" && !evento.shiftKey && !evento.isComposing) {
    evento.preventDefault();
    enviar(entrada.value);
  }
});

entrada.addEventListener("input", ajustarAltura);

iniciar();
