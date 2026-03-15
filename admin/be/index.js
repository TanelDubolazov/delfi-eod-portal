import express from 'express';
import cors from 'cors';
import session from 'express-session';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { initStore } from './data/store.js';
import { initAuth } from './auth/crypto.js';
import { authRouter } from './auth/routes.js';
import { requireAuth } from './auth/middleware.js';
import { articlesRouter } from './routes/articles.js';
import { imagesRouter } from './routes/images.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_DIR = process.pkg
  ? path.dirname(process.execPath)
  : path.resolve(__dirname, '..', '..');

initStore(BASE_DIR);
initAuth(BASE_DIR);

const app = express();
const PORT = process.env.PORT || 3001;

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

app.use('/api/auth', authRouter);
app.use('/api/articles', requireAuth, articlesRouter);
app.use('/api/images', requireAuth, imagesRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`EOD Admin running on http://127.0.0.1:${PORT}`);
});
