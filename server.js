require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const path = require('path');
const http = require('http');
const WebSocket = require('ws');

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));

const {
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  TWITCH_REDIRECT_URI
} = process.env;

// Redirige a Twitch para hacer login
app.get('/auth/twitch', (req, res) => {
  const scope = 'channel:manage:redemptions user:read:email';
  const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${TWITCH_REDIRECT_URI}&response_type=code&scope=${scope}`;
  res.redirect(url);
});

// Recibe el callback de Twitch
app.get('/auth/twitch/callback', async (req, res) => {
  const code = req.query.code;

  try {
    const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: TWITCH_CLIENT_ID,
        client_secret: TWITCH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: TWITCH_REDIRECT_URI
      }
    });

    const { access_token } = tokenResponse.data;

    const userInfo = await axios.get('https://api.twitch.tv/helix/users', {
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Client-ID': TWITCH_CLIENT_ID
      }
    });

    const user = userInfo.data.data[0];

    res.cookie('access_token', access_token, { httpOnly: true });
    res.cookie('user_id', user.id, { httpOnly: true });
    res.redirect('/');
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Error al autenticar con Twitch');
  }
});

// Crear recompensa de canal
app.post('/create-reward', async (req, res) => {
  const token = req.cookies.access_token;
  const broadcaster_id = req.cookies.user_id;

  if (!token || !broadcaster_id) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  const { title, cost, prompt } = req.body;

  try {
    const response = await axios.post(
      'https://api.twitch.tv/helix/channel_points/custom_rewards',
      {
        broadcaster_id,
        title,
        cost: parseInt(cost),
        prompt,
        is_enabled: true
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Client-ID': TWITCH_CLIENT_ID,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({ success: true, reward: response.data });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// Obtener todas las recompensas del canal
app.get('/rewards', async (req, res) => {
  const token = req.cookies.access_token;
  const broadcaster_id = req.cookies.user_id;

  if (!token || !broadcaster_id) {
    return res.status(401).json({ error: 'No autorizado' });
  }

  try {
    const response = await axios.get(
      `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${broadcaster_id}`,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Client-ID': process.env.TWITCH_CLIENT_ID
        }
      }
    );

    res.json(response.data.data);
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

// RUTA OPCIONAL PARA ALERTA HTML
app.get('/alert', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/alert.html'));
});

// Servidor HTTP + WebSocket en uno
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Broadcast a todos los clientes conectados
function enviarAlerta(data) {
  const mensaje = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(mensaje);
    }
  });
}

// Conexión WebSocket
wss.on('connection', (ws) => {
  console.log('🟢 Cliente WebSocket conectado');

  ws.on('close', () => {
    console.log('🔴 Cliente WebSocket desconectado');
  });
});

// 🔥 Guarda esta función si luego quieres invocar alertas desde otro endpoint:
// enviarAlerta({ tipo: 'reward', mensaje: '¡Alguien canjeó!' });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
