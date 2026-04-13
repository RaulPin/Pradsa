'use strict';

/**
 * Password policy — ISO 27001:2022
 * · Minimum 8 characters
 * · At least one uppercase letter (A-Z)
 * · At least one lowercase letter (a-z)
 * · At least one special character (non-alphanumeric)
 */
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[^a-zA-Z0-9]).{8,}$/;

const PASSWORD_POLICY_MSG =
  'La contraseña debe tener mínimo 8 caracteres, una mayúscula, una minúscula y un carácter especial (ISO 27001)';

function validatePassword(password) {
  if (!password || !PASSWORD_REGEX.test(password)) {
    return PASSWORD_POLICY_MSG;
  }
  return null; // valid
}

module.exports = { validatePassword, PASSWORD_POLICY_MSG };
