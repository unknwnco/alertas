
const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const session = require('express-session');
const fetch = require('node-fetch');

require('dotenv').config({ path: path.join(__dirname, '..', 'alertas.env') });

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rewardVideoMap = new Map(); // reward_id -> YouTube URL
let wsClients = [];

wss.on('connection', (ws) => {
  wsClients.push(ws);
  ws.on('close', () => {
    wsClients = wsClients.filter(c => c !== ws);
  });
});

const sendToOverlay = (data) => {
  const payload = JSON.stringify(data);
  wsClients.forEach(ws => ws.send(payload));
};

app.use(bodyParser.json());
app.use(session({ secret: 'twitch_secret', resave: false, saveUninitialized: true }));

// Static files
app.use('/admin', express.static(path.join(__dirname, '..', 'frontend', 'admin')));
app.use('/overlay', express.static(path.join(__dirname, '..', 'frontend')));

// Simulación manual
app.post('/simulate', (req, res) => {
  // Simula el último video agregado
  const values = Array.from(rewardVideoMap.values());
  if (values.length > 0) {
    const lastURL = values[values.length - 1];
    sendToOverlay({ type: 'play_youtube', url: lastURL });
    return res.send({ ok: true });
  }
  res.status(404).send({ error: 'No hay recompensas configuradas' });
});

// Crear recompensa (mock, no usa API real)
app.post('/admin/create-reward', async (req, res) => {
  const { title, cost, prompt, youtube } = req.body;

  if (!title || !cost || !youtube) {
    return res.status(400).json({ error: 'Faltan datos requeridos' });
  }

  // Simula un reward_id generado
  const fakeRewardId = `${Date.now()}`;
  rewardVideoMap.set(fakeRewardId, youtube);

  console.log('[🎁] Recompensa registrada:', title, '->', youtube);
  res.json({ ok: true, reward_id: fakeRewardId });
});

// Endpoint para simular un canje real
app.post('/admin/test-reward/:id', (req, res) => {
  const videoURL = rewardVideoMap.get(req.params.id);
  if (!videoURL) return res.status(404).send({ error: 'Recompensa no encontrada' });

  sendToOverlay({ type: 'play_youtube', url: videoURL });
  res.send({ ok: true });
});

// WebSocket endpoint
app.get('/ws', (req, res) => {
  res.status(426).send('Use WebSocket');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor iniciado en http://localhost:${PORT}`);
});
