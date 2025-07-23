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

// Twitch OAuth
app.get('/auth/twitch', (req, res) => {
  const redirect = `https://id.twitch.tv/oauth2/authorize?client_id=${process.env.TWITCH_CLIENT_ID}&redirect_uri=${process.env.CALLBACK_URL}&response_type=code&scope=user:read:email`;
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
    res.redirect('/admin');
  } catch (e) {
    res.status(500).send('Auth failed');
  }
});

app.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in' });
  res.json(req.session.user);
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

io.on('connection', socket => {
  console.log('Overlay connected');
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Listening on ${port}`));
