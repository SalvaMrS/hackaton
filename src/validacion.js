import { errorHttp } from './auth.js';

export function textoRequerido(valor, campo, max = 200) {
  if (typeof valor !== 'string' || !valor.trim()) throw errorHttp(400, 'campo_invalido', `${campo} es obligatorio`);
  if (valor.length > max) throw errorHttp(400, 'campo_invalido', `${campo} es demasiado largo`);
  return valor.trim();
}

export function textoOpcional(valor, campo, max = 500) {
  if (valor == null || valor === '') return '';
  return textoRequerido(valor, campo, max);
}

export function enteroEnRango(valor, campo, min, max) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < min || numero > max) {
    throw errorHttp(400, 'campo_invalido', `${campo} debe ser un entero entre ${min} y ${max}`);
  }
  return numero;
}

export function coordenadaOpcional(valor, campo, limite) {
  if (valor == null || valor === '') return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || Math.abs(numero) > limite) {
    throw errorHttp(400, 'campo_invalido', `${campo} fuera de rango`);
  }
  return numero;
}

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export function hora(valor, campo) {
  if (typeof valor !== 'string' || !HORA.test(valor)) throw errorHttp(400, 'campo_invalido', `${campo} debe ser HH:MM`);
  return valor;
}

export function slugDesde(nombre) {
  return nombre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const URL_IMAGEN = /^(\/uploads\/[\w.-]+|https?:\/\/\S+)$/;

export function imagenOpcional(valor, campo) {
  if (valor == null || valor === '') return '';
  if (typeof valor !== 'string' || valor.length > 500 || !URL_IMAGEN.test(valor)) {
    throw errorHttp(400, 'campo_invalido', `${campo} debe ser una imagen subida o una URL http(s)`);
  }
  return valor;
}

export function numeroEnRango(valor, campo, min, max) {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < min || numero > max) {
    throw errorHttp(400, 'campo_invalido', `${campo} debe estar entre ${min} y ${max}`);
  }
  return numero;
}

const COLOR_HEX = /^#[0-9a-fA-F]{6}$/;

export function colorOpcional(valor, campo) {
  if (valor == null || valor === '') return '';
  if (typeof valor !== 'string' || !COLOR_HEX.test(valor)) throw errorHttp(400, 'campo_invalido', `${campo} debe ser un color #RRGGBB`);
  return valor;
}
