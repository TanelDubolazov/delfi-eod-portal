import express from 'express';
import cors from 'cors';
import session from 'express-session';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initStore } from './data/store.js';
import { initAuth } from './auth/crypto.js';
import { authRouter } from './auth/routes.js';
import { requireAuth } from './auth/middleware.js';
import { articlesRouter } from './routes/articles.js';
import { imagesRouter } from './routes/images.js';
import { alertRouter } from './routes/alert.js';
import { serverRouter } from './routes/server.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_DIR = process.pkg
  ? path.dirname(process.execPath)
  : path.resolve(__dirname, '..', '..');

initStore(BASE_DIR);
initAuth(BASE_DIR);

const app = express();
const PORT = process.env.PORT || 3001;
app.set('BASE_DIR', BASE_DIR);

const ADMIN_FE_DIST = process.env.ADMIN_FE_DIST
  ? path.resolve(process.env.ADMIN_FE_DIST)
  : path.join(BASE_DIR, 'admin', 'fe', 'dist');
const HAS_ADMIN_FE_DIST = fs.existsSync(path.join(ADMIN_FE_DIST, 'index.html'));

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));

app.use(session({
  name: 'eod.sid',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 30 * 60 * 1000,
  },
}));

app.use('/uploads', express.static(path.join(BASE_DIR, 'news-vault')));

if (HAS_ADMIN_FE_DIST) {
  app.use(express.static(ADMIN_FE_DIST));
}

app.use('/api/auth', authRouter);
app.use('/api/articles', requireAuth, articlesRouter);
app.use('/api/images', requireAuth, imagesRouter);
app.use('/api/alert', requireAuth, alertRouter);
app.use('/api/server', requireAuth, serverRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

if (HAS_ADMIN_FE_DIST) {
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      next();
      return;
    }
    res.sendFile(path.join(ADMIN_FE_DIST, 'index.html'));
  });
}

app.listen(PORT, 'localhost', () => {
  console.log(`EOD Admin running on http://localhost:${PORT}`);
});
