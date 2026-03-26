'use strict';

const crypto = require('crypto');

// ISO 27001:2022 – password policy
const POLICY = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
  requireSpecial: true,
  specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  historyCount: 5,            // can't reuse last 5 passwords
  maxFailedAttempts: 5,
  lockoutMinutes: 30,
};

/**
 * Generate a cryptographically random compliant password.
 * Format: guaranteed 1 uppercase + 1 lowercase + 1 digit + 1 special, rest random.
 */
function generatePassword(length = 16) {
  const upper  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower  = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const special = '!@#$%^&*_+-=';
  const all = upper + lower + digits + special;

  const pick = (charset) => charset[crypto.randomInt(0, charset.length)];

  let chars = [pick(upper), pick(lower), pick(digits), pick(special)];
  for (let i = chars.length; i < length; i++) chars.push(pick(all));

  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * Validate a candidate password against ISO 27001 policy.
 * Returns { valid: bool, errors: string[] }
 */
function validatePassword(password) {
  const errors = [];
  if (!password || typeof password !== 'string') {
    return { valid: false, errors: ['Contraseña requerida.'] };
  }
  if (password.length < POLICY.minLength) {
    errors.push(`Mínimo ${POLICY.minLength} caracteres.`);
  }
  if (password.length > POLICY.maxLength) {
    errors.push(`Máximo ${POLICY.maxLength} caracteres.`);
  }
  if (POLICY.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Debe contener al menos una letra mayúscula.');
  }
  if (POLICY.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Debe contener al menos una letra minúscula.');
  }
  if (POLICY.requireDigit && !/[0-9]/.test(password)) {
    errors.push('Debe contener al menos un número.');
  }
  if (POLICY.requireSpecial && !/[!@#$%^&*()\-_=+\[\]{}|;:,.<>?]/.test(password)) {
    errors.push('Debe contener al menos un carácter especial (!@#$%^&*...).');
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { generatePassword, validatePassword, POLICY };
