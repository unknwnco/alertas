const express = require('express');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');
const bodyParser = require('body-parser');
const session = require('express-session');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const { setupAuth } = require('./auth');
setupAuth(app); // Activar autenticación OAuth

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
  secret: 'supersecretkey',
  resave: false,
  saveUninitialized: false
}));

// WebSocket para Overlay
let overlaySocket = null;
wss.on('connection', function connection(ws) {
  console.log('[📺] Overlay conectado vía WebSocket');
  overlaySocket = ws;
});

// Servir archivos frontend
app.use('/admin', express.static(path.join(__dirname, '../frontend/admin')));
app.use('/', express.static(path.join(__dirname, '../frontend')));

// Enviar recompensa simulada
app.post('/simulate', (req, res) => {
  const { rewardId, videoUrl } = req.body;
  if (overlaySocket && overlaySocket.readyState === WebSocket.OPEN) {
    overlaySocket.send(JSON.stringify({ rewardId, videoUrl }));
    return res.send({ success: true });
  }
  return res.status(500).send({ success: false, message: 'Overlay no conectado' });
});

// Ruta para pruebas manuales por URL
app.get('/admin/test-reward/:id', (req, res) => {
  const rewardId = req.params.id;
  if (overlaySocket && overlaySocket.readyState === WebSocket.OPEN) {
    // Hardcode temporal para test
    const videoUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
    overlaySocket.send(JSON.stringify({ rewardId, videoUrl }));
    return res.send('Recompensa enviada al overlay.');
  }
  return res.status(500).send('Overlay no conectado');
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`[✅] Servidor corriendo en http://localhost:${PORT}`);
});