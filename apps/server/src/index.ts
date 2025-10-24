import express from 'express';
import http from 'http';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { Server } from 'socket.io';
import { Clue, GameConfig, TeamProgress, ChatMessage } from './types.js';
// Load config via fs to avoid JSON import attribute/runtime differences
const configUrl = new URL('./gameConfig.json', import.meta.url);
const configPath = fileURLToPath(configUrl);
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as GameConfig;
import { haversineMeters, imageSimilarity, textSimilarity } from './utils.js';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(serverRoot, 'uploads')));
app.use('/assets', express.static(path.join(serverRoot, 'assets')));

const uploadDir = path.join(serverRoot, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({ storage });

let gameConfig: GameConfig = cfg as any;
let cluesById: Record<string, Clue> = Object.fromEntries(gameConfig.clues.map(c => [c.id, c]));

async function saveConfig() {
  await fs.promises.writeFile(configPath, JSON.stringify(gameConfig, null, 2));
  cluesById = Object.fromEntries(gameConfig.clues.map(c => [c.id, c]));
}

// Ensure reference images exist (generate placeholders if missing)
async function ensureReferenceImages() {
  for (const clue of gameConfig.clues) {
    const refPath = path.join(serverRoot, clue.imagePath);
    const dir = path.dirname(refPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(refPath)) {
      const color = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
      await (await import('sharp')).default({ create: { width: 512, height: 512, channels: 3, background: color } })
        .jpeg({ quality: 80 })
        .toFile(refPath);
      console.log(`Generated placeholder reference image for ${clue.id} at ${refPath}`);
    }
  }
}

const progressByTeam: Map<string, TeamProgress> = new Map();
const chatHistoryByTeam: Map<string, ChatMessage[]> = new Map();

io.on('connection', (socket) => {
  socket.on('join', (teamId: string) => {
    socket.join(teamId);
    if (!progressByTeam.has(teamId)) {
      progressByTeam.set(teamId, {
        teamId,
        currentClueId: gameConfig.startClueId,
        history: [],
        currentSatisfied: { photo: false, qa: false },
        hintStep: 0,
        hintStepPhoto: 0,
        hintStepAnswer: 0
      });
    }
    const p = progressByTeam.get(teamId)!;
    const clue = cluesById[p.currentClueId];
    socket.emit('state', { currentClueId: p.currentClueId, hint: `Start at: ${clue.name}` });
    // Send recent chat history and a welcome
    const hist = chatHistoryByTeam.get(teamId) || [];
    if (hist.length) socket.emit('chat:history', hist);
    const welcome: ChatMessage = { role: 'bot', text: `Welcome! You are at clue "${clue.name}". Ask for a hint or send your answer.`, ts: Date.now() };
    appendChat(teamId, welcome);
    io.to(teamId).emit('chat:message', welcome);
  });

  socket.on('chat:send', async (payload: { teamId: string; text: string; lat?: number; lng?: number }) => {
    try {
      const teamId = String(payload.teamId || 'default');
      const text = String(payload.text || '').trim();
      if (!text) return;
      socket.join(teamId);
      const prog = progressByTeam.get(teamId);
      if (!prog) return;
      // track last location if provided
      if (typeof payload.lat === 'number' && typeof payload.lng === 'number') {
        prog.lastLat = payload.lat;
        prog.lastLng = payload.lng;
      }
      const userMsg: ChatMessage = { role: 'user', text, ts: Date.now() };
      appendChat(teamId, userMsg);
      io.to(teamId).emit('chat:message', userMsg);

      const clue = cluesById[prog.currentClueId];
      const mode = getValidationMode(clue);

      // helper distance
      const lat = payload.lat ?? prog.lastLat ?? clue.lat;
      const lng = payload.lng ?? prog.lastLng ?? clue.lng;
      const distance = haversineMeters(lat, lng, clue.lat, clue.lng);
      const geoOk = distance <= clue.radiusMeters;

      // Simple intents
      const lower = text.toLowerCase();
      const wantsHint = /\bhint\b|\bhelp\b/.test(lower);
      const wantsWhere = /\bwhere\b|\bdistance\b|\bfar\b/.test(lower);
      const answerIntent = /^answer[:\s]|^a[:\s]/.test(lower) || (mode !== 'photo');

      if (wantsWhere) {
        const msg: ChatMessage = { role: 'bot', text: `You are ${Math.round(distance)}m from the target circle.`, ts: Date.now() };
        appendChat(teamId, msg); io.to(teamId).emit('chat:message', msg);
        return;
      }

      if (wantsHint) {
        const msg: ChatMessage = { role: 'bot', text: `Hint: ${getNextClueHint(teamId, clue, 'generic')}`, ts: Date.now() };
        appendChat(teamId, msg); io.to(teamId).emit('chat:message', msg);
        return;
      }

      // If QA is part of validation, try answer matching using whole text or after 'answer:' prefix
      if (answerIntent && (mode === 'qa' || mode === 'both' || mode === 'either')) {
        const expected = clue.expectedAnswer || '';
        const cleaned = text.replace(/^answer[:\s]*/i, '').trim();
        const sim = textSimilarity(cleaned, expected);
        const ansOk = sim >= 0.8;
        if (ansOk) {
          prog.currentSatisfied = { ...(prog.currentSatisfied || { photo: false, qa: false }), qa: true };
          const canAdvance = (() => {
            if (!geoOk) return false;
            const sat = prog.currentSatisfied || { photo: false, qa: false };
            switch (mode) {
              case 'qa': return true;
              case 'both': return sat.photo && sat.qa;
              case 'either': return sat.photo || sat.qa;
              case 'photo': return sat.photo;
            }
          })();
          if (canAdvance) {
            prog.history.push(prog.currentClueId);
            prog.currentClueId = clue.nextClueId || prog.currentClueId;
            prog.currentSatisfied = { photo: false, qa: false };
            const next = clue.nextClueId ? cluesById[clue.nextClueId] : null;
            const msg: ChatMessage = { role: 'bot', text: next ? clue.hint : `${clue.hint} — Hunt complete!`, ts: Date.now() };
            appendChat(teamId, msg); io.to(teamId).emit('chat:message', msg);
          } else {
            const msg: ChatMessage = { role: 'bot', text: geoOk ? 'Answer accepted. Submit a photo to continue.' : 'Answer accepted. Move closer to the target circle.', ts: Date.now() };
            appendChat(teamId, msg); io.to(teamId).emit('chat:message', msg);
          }
          return;
        } else {
          const tip = getNextClueHint(teamId, clue, 'answer');
          const msg: ChatMessage = { role: 'bot', text: `Hint: ${tip}`, ts: Date.now() };
          appendChat(teamId, msg); io.to(teamId).emit('chat:message', msg);
          return;
        }
      }

      // Fallback
      const fallback: ChatMessage = { role: 'bot', text: `Try sending "hint", "where", or start your answer with "answer:".`, ts: Date.now() };
      appendChat(teamId, fallback); io.to(teamId).emit('chat:message', fallback);
    } catch (e) {
      console.error(e);
    }
  });
});

function appendChat(teamId: string, msg: ChatMessage) {
  const arr = chatHistoryByTeam.get(teamId) || [];
  arr.push(msg);
  while (arr.length > 50) arr.shift();
  chatHistoryByTeam.set(teamId, arr);
}

function getNextClueHint(teamId: string, clue: Clue, kind: 'generic' | 'photo' | 'answer' = 'generic'): string {
  const prog = progressByTeam.get(teamId);
  const defaultTip = 'Try a different angle, match the view, or read nearby signs.';
  if (!prog) return defaultTip;
  const pickList = () => {
    if (kind === 'photo') return (clue.hintsPhoto || []).filter(Boolean);
    if (kind === 'answer') return (clue.hintsAnswer || []).filter(Boolean);
    return (clue.hints || []).filter(Boolean);
  };
  let hints = pickList();
  // fallback to generic if specific missing
  if (hints.length === 0 && kind !== 'generic') {
    hints = (clue.hints || []).filter(Boolean);
  }
  if (hints.length === 0) {
    const globals = (gameConfig.wrongImageTips && gameConfig.wrongImageTips.length ? gameConfig.wrongImageTips : gameConfig.wrongAnswerTips) || [];
    return globals[0] || defaultTip;
  }
  const stepKey = kind === 'photo' ? 'hintStepPhoto' : kind === 'answer' ? 'hintStepAnswer' : 'hintStep';
  const current = (prog as any)[stepKey] ?? 0;
  const idx = Math.max(0, Math.min(current, hints.length - 1));
  const tip = hints[idx];
  (prog as any)[stepKey] = Math.min(hints.length - 1, idx + 1);
  return tip || defaultTip;
}

function getValidationMode(clue: Clue): 'photo' | 'qa' | 'both' | 'either' {
  if (clue.validationMode) return clue.validationMode;
  const p = clue.requirePhoto ?? true;
  const q = clue.requireQA ?? false;
  if (p && q) return 'both';
  if (q && !p) return 'qa';
  return 'photo';
}

app.get('/api/clue/:id', (req, res) => {
  const clue = cluesById[req.params.id];
  if (!clue) return res.status(404).json({ error: 'Not found' });
  res.json({
    id: clue.id,
    name: clue.name,
    lat: clue.lat,
    lng: clue.lng,
    radiusMeters: clue.radiusMeters,
    requirePhoto: clue.requirePhoto ?? true,
    requireQA: clue.requireQA ?? false,
    question: clue.question || '',
    validationMode: getValidationMode(clue)
  });
});

// Simple admin auth via header token (optional in dev)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'dev';
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.header('x-admin-token');
  if (!ADMIN_TOKEN || ADMIN_TOKEN === 'dev') return next();
  if (token === ADMIN_TOKEN) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

// Admin: read config
app.get('/api/admin/config', requireAdmin, (req, res) => {
  res.json(gameConfig);
});

// Admin: set start clue
app.put('/api/admin/start/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  if (!cluesById[id]) return res.status(400).json({ error: 'Clue not found' });
  gameConfig.startClueId = id;
  await saveConfig();
  res.json({ ok: true });
});

// Admin: create clue
app.post('/api/admin/clue', requireAdmin, async (req, res) => {
  const { id, name, lat, lng, radiusMeters, hint, nextClueId } = req.body || {};
  if (!id || !name) return res.status(400).json({ error: 'id and name required' });
  if (cluesById[id]) return res.status(400).json({ error: 'Clue id already exists' });
  const c: Clue = { id, name, lat: Number(lat)||0, lng: Number(lng)||0, radiusMeters: Number(radiusMeters)||50, imagePath: `assets/clues/${id}.jpg`, hint: hint||'', nextClueId: nextClueId||undefined };
  gameConfig.clues.push(c);
  await saveConfig();
  res.json(c);
});

// Admin: update clue
app.put('/api/admin/clue/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  const idx = gameConfig.clues.findIndex(c => c.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const existing = gameConfig.clues[idx];
  const body = req.body || {};
  const updated: Clue = { ...existing, ...body };
  gameConfig.clues[idx] = updated;
  await saveConfig();
  res.json(updated);
});

// Admin: delete clue
app.delete('/api/admin/clue/:id', requireAdmin, async (req, res) => {
  const id = req.params.id;
  const idx = gameConfig.clues.findIndex(c => c.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  gameConfig.clues.splice(idx, 1);
  if (gameConfig.startClueId === id && gameConfig.clues[0]) gameConfig.startClueId = gameConfig.clues[0].id;
  // do not adjust references automatically; keep simple
  await saveConfig();
  res.json({ ok: true });
});

// Admin: upload reference image for a clue
app.post('/api/admin/clue/:id/image', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const id = req.params.id;
    const clue = cluesById[id];
    if (!clue) return res.status(404).json({ error: 'Clue not found' });
    const tmpPath = req.file?.path;
    if (!tmpPath) return res.status(400).json({ error: 'Missing image' });
    const ext = path.extname(req.file!.originalname) || '.jpg';
    const destRel = `assets/clues/${id}${ext.toLowerCase()}`;
    const destAbs = path.join(serverRoot, destRel);
    const destDir = path.dirname(destAbs);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    await fs.promises.copyFile(tmpPath, destAbs);
    // update clue imagePath
    clue.imagePath = destRel;
    // persist config
    await saveConfig();
    res.json({ ok: true, imagePath: destRel });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to set image' });
  }
});

// Admin: set global tips
app.put('/api/admin/tips', requireAdmin, async (req, res) => {
  const { wrongImageTips, wrongAnswerTips } = req.body || {};
  if (wrongImageTips !== undefined) gameConfig.wrongImageTips = Array.isArray(wrongImageTips) ? wrongImageTips : [];
  if (wrongAnswerTips !== undefined) gameConfig.wrongAnswerTips = Array.isArray(wrongAnswerTips) ? wrongAnswerTips : [];
  await saveConfig();
  res.json({ ok: true });
});

app.post('/api/upload', upload.single('photo'), async (req, res) => {
  try {
    const teamId = String(req.body.teamId || 'default');
    const clueId = String(req.body.clueId);
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    const filePath = req.file?.path;

    if (!filePath) return res.status(400).json({ error: 'Missing image' });
    const progress = progressByTeam.get(teamId);
    if (!progress) return res.status(400).json({ error: 'Team not joined' });
    if (progress.currentClueId !== clueId) return res.status(400).json({ error: 'Wrong clue' });
    const clue = cluesById[clueId];
    if (!clue) return res.status(400).json({ error: 'Invalid clue' });

    const distance = haversineMeters(lat, lng, clue.lat, clue.lng);
    const geoOk = distance <= clue.radiusMeters;

    const mode = getValidationMode(clue);
    const requirePhoto = mode === 'photo' || mode === 'both' || mode === 'either';
    let similarity = 1;
    let imgOk = true;
    if (requirePhoto) {
      const referencePath = path.join(serverRoot, clue.imagePath);
      if (!fs.existsSync(referencePath)) {
        return res.status(500).json({ error: 'Reference image missing on server' });
      }
      similarity = await imageSimilarity(referencePath, filePath);
      imgOk = similarity >= 0.75; // tweak threshold
    }

    // progress already declared above
    if (imgOk) progress.currentSatisfied = { ...(progress.currentSatisfied || { photo: false, qa: false }), photo: true };

    const canAdvance = (() => {
      if (!geoOk) return false;
      const sat = progress.currentSatisfied || { photo: false, qa: false };
      switch (mode) {
        case 'photo': return imgOk;
        case 'qa': return sat.qa; // uploading photo alone won't pass
        case 'both': return sat.photo && sat.qa;
        case 'either': return sat.photo || sat.qa;
      }
    })();

    if (canAdvance) {
      progress.history.push(progress.currentClueId);
      progress.currentClueId = clue.nextClueId || progress.currentClueId;
      progress.currentSatisfied = { photo: false, qa: false };
      progress.hintStep = 0;
      progress.hintStepPhoto = 0;
      progress.hintStepAnswer = 0;
      const next = clue.nextClueId ? cluesById[clue.nextClueId] : null;
      io.to(teamId).emit('progress', { nextClueId: next?.id || null, done: !next });
      const chatMsg: ChatMessage = { role: 'bot', text: next ? 'Photo accepted.' : 'Photo accepted. Hunt complete!', ts: Date.now() };
      appendChat(teamId, chatMsg); io.to(teamId).emit('chat:message', chatMsg);
    } else {
      if (!imgOk) {
        const tip = getNextClueHint(teamId, clue, 'photo');
        const msg: ChatMessage = { role: 'bot', text: `Hint: ${tip}`, ts: Date.now() };
        appendChat(teamId, msg); io.to(teamId).emit('chat:message', msg);
      }
    }

    res.json({ ok: canAdvance, geoOk, imgOk, similarity, distance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// QA answer endpoint
app.post('/api/answer', async (req, res) => {
  try {
    const teamId = String(req.body.teamId || 'default');
    const clueId = String(req.body.clueId);
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    const answer = String(req.body.answer || '');
    const progress = progressByTeam.get(teamId);
    if (!progress) return res.status(400).json({ error: 'Team not joined' });
    if (progress.currentClueId !== clueId) return res.status(400).json({ error: 'Wrong clue' });
    const clue = cluesById[clueId];
    if (!clue) return res.status(400).json({ error: 'Invalid clue' });

    // Log the user's answer into chat
    const userMsg: ChatMessage = { role: 'user', text: `answer: ${answer}`, ts: Date.now() };
    appendChat(teamId, userMsg); io.to(teamId).emit('chat:message', userMsg);

    const distance = haversineMeters(lat, lng, clue.lat, clue.lng);
    const geoOk = distance <= clue.radiusMeters;
    const mode = getValidationMode(clue);
    const requireQA = mode === 'qa' || mode === 'both' || mode === 'either';
    const expected = clue.expectedAnswer || '';
    const sim = textSimilarity(answer, expected);
    const ansOk = !requireQA || sim >= 0.8;
    // progress already declared above
    if (ansOk) progress.currentSatisfied = { ...(progress.currentSatisfied || { photo: false, qa: false }), qa: true };

    const canAdvance = (() => {
      if (!geoOk) return false;
      const sat = progress.currentSatisfied || { photo: false, qa: false };
      switch (mode) {
        case 'photo': return sat.photo; // answering alone won't pass
        case 'qa': return ansOk;
        case 'both': return sat.photo && sat.qa;
        case 'either': return sat.photo || sat.qa;
      }
    })();

    if (canAdvance) {
      progress.history.push(progress.currentClueId);
      progress.currentClueId = clue.nextClueId || progress.currentClueId;
      progress.currentSatisfied = { photo: false, qa: false };
      progress.hintStep = 0;
      progress.hintStepPhoto = 0;
      progress.hintStepAnswer = 0;
      const next = clue.nextClueId ? cluesById[clue.nextClueId] : null;
      io.to(teamId).emit('progress', { nextClueId: next?.id || null, done: !next });
      const chatMsg: ChatMessage = { role: 'bot', text: next ? 'Answer accepted.' : 'Answer accepted. Hunt complete!', ts: Date.now() };
      appendChat(teamId, chatMsg); io.to(teamId).emit('chat:message', chatMsg);
    } else {
      if (!ansOk) {
        const failMsg: ChatMessage = { role: 'bot', text: 'Answer not accepted.', ts: Date.now() };
        appendChat(teamId, failMsg); io.to(teamId).emit('chat:message', failMsg);
        const tip = getNextClueHint(teamId, clue, 'answer');
        const msg: ChatMessage = { role: 'bot', text: `Hint: ${tip}`, ts: Date.now() };
        appendChat(teamId, msg); io.to(teamId).emit('chat:message', msg);
      }
    }

    res.json({ ok: canAdvance, geoOk, ansOk, similarity: sim, distance });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Answer failed' });
  }
});

const PORT = Number(process.env.PORT || 4000);
ensureReferenceImages().then(() => {
  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
});

// Graceful shutdown and clearer port-in-use messaging
server.on('error', (err: any) => {
  if (err && (err as any).code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Another process may be running.\n` +
      `On Windows PowerShell, run: netstat -ano | Select-String ':${PORT}' to find the PID, then taskkill /PID <pid> /F`);
  } else {
    console.error(err);
  }
});

function shutdown() {
  console.log('Shutting down server...');
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
