import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initStore } from './data/store.js';
import { articlesRouter } from './routes/articles.js';
import { imagesRouter } from './routes/images.js';

// TODO: auth (scrypt hashing, encrypted .admin/ vault, passphrase on startup)
// TODO: session timeout (30min)
// TODO: pkg binary build, serve vue dist from it
// TODO: separate published/unpublished in vault somehow?

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_DIR = process.pkg
  ? path.dirname(process.execPath)
  : path.resolve(__dirname, '..', '..');

initStore(BASE_DIR);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));

app.use('/uploads', express.static(path.join(BASE_DIR, 'news-vault')));

app.use('/api/articles', articlesRouter);
app.use('/api/images', imagesRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`EOD Admin running on http://127.0.0.1:${PORT}`);
});
