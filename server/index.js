// REALITYSURFACE — server principale (API, account, upload, QR, redirect, viewer).
import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, UPLOADS_DIR } from './db.js';
import { auth } from './auth.js';
import { api } from './routes/api.js';
import { publicRouter } from './routes/public.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 5500;

app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '4mb' }));
app.use(cookieParser());

// Librerie servite dal node_modules (nessun bundler): importmap in ogni pagina.
const NM = path.join(ROOT, 'node_modules');
app.use('/vendor/three', express.static(path.join(NM, 'three'), { maxAge: '7d' }));
app.use('/vendor/mind-ar', express.static(path.join(NM, 'mind-ar', 'dist'), { maxAge: '7d' }));

app.use('/static', express.static(path.join(ROOT, 'public'), { maxAge: 0 }));
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '1h', index: false }));

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', auth);
app.use('/api', api);
app.use('/', publicRouter);

app.use((err, req, res, next) => {
  if (!err.status) console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ errore: String(err.message || err) });
});

app.listen(PORT, () => {
  console.log(`REALITYSURFACE su http://localhost:${PORT}  (editor: /editor/  viewer: /v/<slug>/<pagina>)`);
  if (process.env.PUBLIC_URL) console.log(`URL pubblico per i QR: ${process.env.PUBLIC_URL}`);
});
