'use strict';

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  appUrl: (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, ''),

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: '8h',
    cookieName: 'ep_session',
  },

  bcryptRounds: 12,
  maxLoginAttempts: 5,
  lockoutMinutes: 30,

  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
  },

  dbPath: process.env.DB_PATH || './data/entrevistaspradsa.db',
  uploadDir: process.env.UPLOAD_DIR || './uploads/photos',

  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@entrevistaspradsa.com',
    name: process.env.ADMIN_NAME || 'Administrador',
  },
};

if (!config.jwt.secret) {
  console.error('[FATAL] JWT_SECRET no está configurado. Créalo en el archivo .env');
  process.exit(1);
}

if (config.jwt.secret.length < 32) {
  console.error('[FATAL] JWT_SECRET debe tener al menos 32 caracteres');
  process.exit(1);
}

module.exports = config;
