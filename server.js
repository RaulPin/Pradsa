'use strict';
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const config = require('./src/config');
require('./src/db/database'); // Inicializa la base de datos y crea admin si no existe

const authRoutes = require('./src/routes/authRoutes');
const userRoutes = require('./src/routes/userRoutes');
const interviewRoutes = require('./src/routes/interviewRoutes');
const reportRoutes = require('./src/routes/reportRoutes');
const wordRoutes   = require('./src/routes/wordRoutes');
const { setupSignaling } = require('./src/signaling');
const { requireAuth } = require('./src/middleware/auth');

// Crear directorios requeridos
['uploads/photos', 'uploads/recordings', 'data'].forEach((dir) => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

const app = express();
const server = http.createServer(app);

// Cabeceras de seguridad – ISO 27001:2022
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'", 'wss:', 'ws:'],
        imgSrc: ["'self'", 'blob:', 'data:'],
        frameAncestors: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// Confiar en proxy inverso para IPs reales en logs de auditoría
app.set('trust proxy', 1);

// Rate limiter global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intenta en unos minutos.' },
});
app.use(globalLimiter);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(cookieParser());

// Archivos estáticos públicos
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

// Fotos y grabaciones – solo usuarios autenticados
app.use('/uploads', requireAuth, express.static(path.join(__dirname, 'uploads')));
app.use('/recordings', requireAuth, express.static(path.join(__dirname, 'uploads', 'recordings')));

// Rutas API
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/interviews', interviewRoutes);
app.use('/report', reportRoutes);
app.use('/export', wordRoutes);

// Páginas HTML
const htmlPages = {
  '/login': 'login.html',
  '/dashboard': 'dashboard.html',
  '/interview': 'interview.html',
  '/join': 'join.html',
  '/questionnaire':      'questionnaire.html',
  '/questionnaire-pyme': 'questionnaire-pyme.html',
  '/expediente':         'expediente.html',
};

Object.entries(htmlPages).forEach(([route, file]) => {
  app.get(route, (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', file));
  });
});

app.get('/', (_req, res) => res.redirect('/login'));

// 404
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Recurso no encontrado' });
  }
  res.redirect('/login');
});

// Manejador de errores
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error(`[ERROR] ${err.message}`);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'Error interno del servidor' });
  }
  res.redirect('/login');
});

// WebSocket de señalización WebRTC
setupSignaling(server);

server.listen(config.port, () => {
  console.log('\n' + '='.repeat(55));
  console.log('  EntrevistasPradsa');
  console.log(`  http://localhost:${config.port}`);
  console.log(`  Ambiente: ${config.nodeEnv}`);
  console.log(`  URL pública: ${config.appUrl}`);
  console.log('='.repeat(55) + '\n');
});
