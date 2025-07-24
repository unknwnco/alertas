require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const axios = require('axios');
const fs = require('fs');
const http = require('http');
const { Server } = require('socket.io');
const { registerEventSub, verifyTwitchSignature } = require('./eventsub');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rewards = require('./rewards.json');

app.set('socketio', io);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false
}));

app.use(express.static(path.join(__dirname, '../frontend/public')));
app.use('/admin', express.static(path.join(__dirname, '../frontend/admin')));
app.use('/media', express.static(path.join(__dirname, '../frontend/public/media')));

// OAuth login
app.get('/auth/twitch', (req, res) => {
  const redirect = `https://id.twitch.tv/oauth2/authorize?client_id=${process.env.TWITCH_CLIENT_ID}&redirect_uri=${process.env.CALLBACK_URL}&response_type=code&scope=user:read:email channel:manage:redemptions channel:read:redemptions`;
  res.redirect(redirect);
});

app.get('/auth/twitch/callback', async (req, res) => {
  try {
    const { code } = req.query;
    const { data } = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: process.env.TWITCH_CLIENT_ID,
        client_secret: process.env.TWITCH_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.CALLBACK_URL
      }
    });

    const user = await axios.get('https://api.twitch.tv/helix/users', {
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${data.access_token}`
      }
    });

    req.session.user = user.data.data[0];
    req.session.token = data.access_token;

    await registerEventSub({
      user_id: req.session.user.id,
      access_token: data.access_token,
      callbackURL: process.env.EVENTSUB_CALLBACK_URL,
      secret: process.env.EVENTSUB_SECRET
    });

    res.redirect('/admin');
  } catch (err) {
    console.error(err.response?.data || err);
    res.status(500).send('Auth failed');
  }
});

// Overlay endpoint
app.get('/overlay', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/overlay.html'));
});

// Rewards API
app.get('/rewards', (req, res) => {
  if (!req.session.user) return res.status(401).send('Unauthorized');
  res.json(rewards);
});

app.post('/rewards', (req, res) => {
  if (!req.session.user) return res.status(401).send('Unauthorized');
  rewards[req.body.title] = req.body.file;
  fs.writeFileSync(path.join(__dirname, 'rewards.json'), JSON.stringify(rewards, null, 2));
  res.sendStatus(200);
});

app.post('/simulate', (req, res) => {
  const { title } = req.body;
  const file = rewards[title];
  if (file) io.emit('play', file);
  res.sendStatus(200);
});

app.post('/rewards/create-on-twitch', async (req, res) => {
  if (!req.session.user || !req.session.user.id || !req.session.token) {
    return res.status(401).send('Unauthorized');
  }

  const { title, cost, prompt } = req.body;

  if (!title || !prompt || !cost || isNaN(cost) || cost <= 0) {
    return res.status(400).send('Invalid reward data');
  }

  try {
    await axios.post(
      'https://api.twitch.tv/helix/channel_points/custom_rewards',
      {
        title: title.trim(),
        cost: parseInt(cost),
        prompt: prompt.trim(),
        is_enabled: true
      },
      {
        headers: {
          'Client-ID': process.env.TWITCH_CLIENT_ID,
          'Authorization': `Bearer ${req.session.token}`,
          'Content-Type': 'application/json'
        },
        params: {
          broadcaster_id: req.session.user.id
        }
      }
    );
    res.sendStatus(200);
  } catch (err) {
    console.error("Twitch API error:", err.response?.status, err.response?.data);
    res.status(500).send(err.response?.data?.message || 'Twitch API error');
  }
});

// EventSub listener
app.post('/eventsub/twitch', express.raw({ type: 'application/json' }), (req, res) => {
  const rawBody = req.body.toString();
  const headers = req.headers;
  const secret = process.env.EVENTSUB_SECRET;

  if (!verifyTwitchSignature(secret, rawBody, headers)) {
    return res.status(403).send('Invalid signature');
  }

  const messageType = headers['twitch-eventsub-message-type'];
  const body = JSON.parse(rawBody);

  if (messageType === 'webhook_callback_verification') {
    return res.status(200).send(body.challenge);
  }

  if (messageType === 'notification') {
    const { reward } = body.event;
    const file = rewards[reward.title];
    if (file) io.emit('play', file);
    return res.sendStatus(204);
  }

  res.sendStatus(204);
});

io.on('connection', socket => {
  console.log('Overlay connected');
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Listening on ${port}`));


// 👇 Nueva ruta para ver las suscripciones EventSub desde el panel
app.get('/eventsub/subscriptions', async (req, res) => {
  try {
    const response = await axios.get('https://api.twitch.tv/helix/eventsub/subscriptions', {
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${req.session.token}`
      }
    });
    res.json({ subscriptions: response.data.data });
  } catch (err) {
    console.error('Error fetching EventSub subs:', err.response?.data || err.message);
    res.status(500).send('Failed to fetch subscriptions');
  }
});


// 👇 Ruta para registrar manualmente el webhook desde el panel admin
app.post('/eventsub/register', async (req, res) => {
  try {
    if (!req.session.user || !req.session.token) {
      return res.status(401).send("Not logged in");
    }

    await registerEventSub({
      user_id: req.session.user.id,
      access_token: req.session.token,
      callbackURL: process.env.EVENTSUB_CALLBACK_URL,
      secret: process.env.EVENTSUB_SECRET
    });

    res.send("OK");
  } catch (err) {
    console.error("Failed to re-register EventSub:", err.response?.data || err.message);
    res.status(500).send("Failed to register EventSub");
  }
});


// Manual registration test endpoint
app.post('/admin/register-eventsub-test', async (req, res) => {
  const callbackURL = process.env.EVENTSUB_CALLBACK_URL;
  const accessToken = global.accessToken || process.env.TWITCH_ACCESS_TOKEN;
  const userId = global.userId || process.env.TWITCH_USER_ID;
  const secret = process.env.EVENTSUB_SECRET;

  if (!callbackURL || !accessToken || !userId || !secret) {
    return res.status(400).send('Missing required environment variables.');
  }

  try {
    const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST',
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'channel.channel_points_custom_reward_redemption.add',
        version: '1',
        condition: {
          broadcaster_user_id: userId
        },
        transport: {
          method: 'webhook',
          callback: callbackURL,
          secret: secret
        }
      })
    });

    const json = await response.json();
    console.log('📡 Manual Register Response:', json);
    if (!response.ok) {
      return res.status(500).send(JSON.stringify(json));
    }
    res.send('Registered successfully');
  } catch (err) {
    console.error('Error registering EventSub:', err);
    res.status(500).send('Registration failed');
  }
});
