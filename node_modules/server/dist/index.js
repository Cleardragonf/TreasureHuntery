import express from 'express';
import http from 'http';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Server } from 'socket.io';
import cfg from './gameConfig.json' with { type: 'json' };
import { haversineMeters, imageSimilarity } from './utils.js';
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(process.cwd(), 'apps/server/uploads')));
const uploadDir = path.join(process.cwd(), 'apps/server/uploads');
const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, uploadDir),
    filename: (_, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    }
});
const upload = multer({ storage });
const gameConfig = cfg;
const cluesById = Object.fromEntries(gameConfig.clues.map(c => [c.id, c]));
// Ensure reference images exist (generate placeholders if missing)
async function ensureReferenceImages() {
    for (const clue of gameConfig.clues) {
        const refPath = path.join(process.cwd(), 'apps/server', clue.imagePath);
        const dir = path.dirname(refPath);
        if (!fs.existsSync(dir))
            fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(refPath)) {
            const color = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
            await (await import('sharp')).default({ create: { width: 512, height: 512, channels: 3, background: color } })
                .jpeg({ quality: 80 })
                .toFile(refPath);
            console.log(`Generated placeholder reference image for ${clue.id} at ${refPath}`);
        }
    }
}
const progressByTeam = new Map();
io.on('connection', (socket) => {
    socket.on('join', (teamId) => {
        socket.join(teamId);
        if (!progressByTeam.has(teamId)) {
            progressByTeam.set(teamId, {
                teamId,
                currentClueId: gameConfig.startClueId,
                history: []
            });
        }
        const p = progressByTeam.get(teamId);
        const clue = cluesById[p.currentClueId];
        socket.emit('state', { currentClueId: p.currentClueId, hint: `Start at: ${clue.name}` });
    });
});
app.get('/api/clue/:id', (req, res) => {
    const clue = cluesById[req.params.id];
    if (!clue)
        return res.status(404).json({ error: 'Not found' });
    res.json({ id: clue.id, name: clue.name, lat: clue.lat, lng: clue.lng, radiusMeters: clue.radiusMeters });
});
app.post('/api/upload', upload.single('photo'), async (req, res) => {
    try {
        const teamId = String(req.body.teamId || 'default');
        const clueId = String(req.body.clueId);
        const lat = Number(req.body.lat);
        const lng = Number(req.body.lng);
        const filePath = req.file?.path;
        if (!filePath)
            return res.status(400).json({ error: 'Missing image' });
        const progress = progressByTeam.get(teamId);
        if (!progress)
            return res.status(400).json({ error: 'Team not joined' });
        if (progress.currentClueId !== clueId)
            return res.status(400).json({ error: 'Wrong clue' });
        const clue = cluesById[clueId];
        if (!clue)
            return res.status(400).json({ error: 'Invalid clue' });
        const distance = haversineMeters(lat, lng, clue.lat, clue.lng);
        const geoOk = distance <= clue.radiusMeters;
        const referencePath = path.join(process.cwd(), 'apps/server', clue.imagePath);
        if (!fs.existsSync(referencePath)) {
            return res.status(500).json({ error: 'Reference image missing on server' });
        }
        const similarity = await imageSimilarity(referencePath, filePath);
        const imgOk = similarity >= 0.75; // tweak threshold
        const ok = geoOk && imgOk;
        if (ok) {
            progress.history.push(progress.currentClueId);
            progress.currentClueId = clue.nextClueId || progress.currentClueId;
            const next = clue.nextClueId ? cluesById[clue.nextClueId] : null;
            io.to(teamId).emit('hint', {
                message: clue.hint,
                nextClueId: next?.id || null,
                done: !next
            });
        }
        res.json({ ok, geoOk, imgOk, similarity, distance });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Upload failed' });
    }
});
const PORT = Number(process.env.PORT || 4000);
ensureReferenceImages().then(() => {
    server.listen(PORT, () => {
        console.log(`Server listening on http://localhost:${PORT}`);
    });
});
