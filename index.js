const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const WebSocket = require('ws');

const app = express();
const port = process.env.PORT || 3000;
const secret = process.env.EVENTSUB_SECRET;
const twitchClientId = process.env.TWITCH_CLIENT_ID;
const twitchClientSecret = process.env.TWITCH_CLIENT_SECRET;
const twitchUsername = process.env.TWITCH_USERNAME;

let accessToken = null;
let twitchUserId = null;

const wss = new WebSocket.Server({ noServer: true });
const sockets = new Set();

app.use(express.json({
  verify: (req, res, buf) => {
    const messageId = req.header('Twitch-Eventsub-Message-Id');
    const timestamp = req.header('Twitch-Eventsub-Message-Timestamp');
    const messageSignature = req.header('Twitch-Eventsub-Message-Signature');
    const hmacMessage = messageId + timestamp + buf;
    const computedSignature = 'sha256=' +
      crypto.createHmac('sha256', secret).update(hmacMessage).digest('hex');
    if (computedSignature !== messageSignature) {
      throw new Error('Invalid Twitch signature');
    }
  }
}));

app.post('/webhook', (req, res) => {
  const { subscription, challenge, event } = req.body;
  const msgType = req.header('Twitch-Eventsub-Message-Type');

  if (msgType === 'webhook_callback_verification') {
    console.log('✅ Verificación recibida de Twitch');
    return res.status(200).send(challenge);  // ¡Devolver exactamente el challenge!
  }

  if (msgType === 'notification') {
    const payload = {
      type: subscription.type,
      data: event
    };
    sockets.forEach(ws => ws.send(JSON.stringify(payload)));
    return res.status(204).end();
  }

  res.status(200).end();
});

app.get('/ws', (req, res) => res.sendStatus(200));

const server = app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head, (ws) => {
    sockets.add(ws);
    ws.on('close', () => sockets.delete(ws));
  });
});

async function fetchAccessToken() {
  const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
    params: {
      client_id: twitchClientId,
      client_secret: twitchClientSecret,
      grant_type: 'client_credentials'
    }
  });
  accessToken = res.data.access_token;
}

async function fetchUserId(username) {
  const res = await axios.get('https://api.twitch.tv/helix/users', {
    params: { login: username },
    headers: {
      'Client-ID': twitchClientId,
      Authorization: `Bearer ${accessToken}`
    }
  });
  return res.data.data[0]?.id || null;
}

async function subscribe(type, condition) {
  await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
    type,
    version: '1',
    condition,
    transport: {
      method: 'webhook',
      callback: 'https://alertas-3hqs.onrender.com/webhook',
      secret
    }
  }, {
    headers: {
      'Client-ID': twitchClientId,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
}

(async () => {
  try {
    await fetchAccessToken();
    twitchUserId = await fetchUserId(twitchUsername);
    if (!twitchUserId) {
      console.error('❌ No se pudo obtener el User ID desde el username.');
      process.exit(1);
    }

    await subscribe('channel.follow', { broadcaster_user_id: twitchUserId });
    await subscribe('channel.subscribe', { broadcaster_user_id: twitchUserId });
    await subscribe('channel.cheer', { broadcaster_user_id: twitchUserId });
    await subscribe('channel.raid', { to_broadcaster_user_id: twitchUserId });

    console.log('✅ Suscripciones EventSub activadas correctamente.');
  } catch (error) {
    console.error('❌ Error durante la inicialización:', error.message);
    process.exit(1);
  }
})();