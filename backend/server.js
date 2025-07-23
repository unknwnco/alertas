require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const axios = require('axios');
const fs = require('fs');
const { Server } = require('socket.io');
const http = require('http');
const rewards = require('./rewards.json');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: process.env.SESSION_SECRET || 'secret', resave: false, saveUninitialized: false }));

app.use(express.static(path.join(__dirname, '../frontend/public')));
app.use('/admin', express.static(path.join(__dirname, '../frontend/admin')));

// Twitch OAuth login
app.get('/auth/twitch', (req, res) => {
  const redirect = `https://id.twitch.tv/oauth2/authorize?client_id=${process.env.TWITCH_CLIENT_ID}&redirect_uri=${process.env.CALLBACK_URL}&response_type=code&scope=user:read:email channel:manage:redemptions`;
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
    res.redirect('/admin');
  } catch (e) {
    console.error(e);
    res.status(500).send('Auth failed');
  }
});

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

// ✅ FIXED: Create Twitch Reward
app.post('/rewards/create-on-twitch', async (req, res) => {
  if (!req.session.user || !req.session.user.id || !req.session.token) {
    return res.status(401).send('Unauthorized');
  }

  const { title, cost, prompt } = req.body;

  if (!title || !prompt || !cost || isNaN(cost) || cost <= 0) {
    return res.status(400).send('Invalid reward data');
  }

  try {
    const twitchResponse = await axios.post(
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

    console.log("✅ Reward created:", twitchResponse.data);
    res.sendStatus(200);
  } catch (err) {
    console.error("❌ Twitch API error:", err.response?.status, err.response?.data);
    res.status(500).send(err.response?.data?.message || 'Twitch API error');
  }
});

io.on('connection', socket => {
  console.log('Overlay connected');
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Listening on ${port}`));
