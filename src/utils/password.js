'use strict';
const bcrypt = require('bcryptjs');
const config = require('../config');

// Conjuntos de caracteres sin ambiguos (0/O, 1/l/I)
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '@$!%*?&_#^+=';
const ALL = UPPER + LOWER + DIGITS + SPECIAL;

function rand(max) {
  return Math.floor(Math.random() * max);
}

/**
 * Genera una contraseña temporal aleatoria segura (14 caracteres mínimo).
 * Cumple con la política ISO 27001:2022.
 */
function generateTempPassword() {
  const chars = [
    UPPER[rand(UPPER.length)],
    UPPER[rand(UPPER.length)],
    LOWER[rand(LOWER.length)],
    LOWER[rand(LOWER.length)],
    DIGITS[rand(DIGITS.length)],
    DIGITS[rand(DIGITS.length)],
    SPECIAL[rand(SPECIAL.length)],
    SPECIAL[rand(SPECIAL.length)],
  ];

  while (chars.length < 14) {
    chars.push(ALL[rand(ALL.length)]);
  }

  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

/**
 * Valida que una contraseña cumpla la política ISO 27001:2022.
 * @returns {string[]} Lista de errores (vacío = válida)
 */
function validatePassword(password, email = '') {
  const errors = [];

  if (typeof password !== 'string' || password.length < 12) {
    errors.push('Debe tener al menos 12 caracteres');
  }
  if (password.length > 128) {
    errors.push('No debe exceder 128 caracteres');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Debe contener al menos una letra mayúscula');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Debe contener al menos una letra minúscula');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Debe contener al menos un número');
  }
  if (!/[@$!%*?&_#^+=\-]/.test(password)) {
    errors.push('Debe contener al menos un carácter especial (@$!%*?&_#^+=-)');
  }

  const emailUser = email ? email.split('@')[0].toLowerCase() : '';
  if (emailUser && emailUser.length > 2 && password.toLowerCase().includes(emailUser)) {
    errors.push('La contraseña no debe contener tu nombre de usuario');
  }

  return errors;
}

async function hashPassword(plain) {
  return bcrypt.hash(plain, config.bcryptRounds);
}

async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

module.exports = { generateTempPassword, validatePassword, hashPassword, verifyPassword };
