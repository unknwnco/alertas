const axios = require('axios');
const crypto = require('crypto');

function verifyTwitchSignature(secret, body, headers) {
  const messageId = headers['twitch-eventsub-message-id'];
  const timestamp = headers['twitch-eventsub-message-timestamp'];
  const messageSignature = headers['twitch-eventsub-message-signature'];
  const hmac = 'sha256=' + crypto.createHmac('sha256', secret)
    .update(messageId + timestamp + body)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(messageSignature));
}

async function registerEventSub({ user_id, access_token, callbackURL, secret }) {
  try {
    await axios.post('https://api.twitch.tv/helix/eventsub/subscriptions', {
      type: 'channel.channel_points_custom_reward_redemption.add',
      version: '1',
      condition: { broadcaster_user_id: user_id },
      transport: {
        method: 'webhook',
        callback: callbackURL,
        secret
      }
    }, {
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ EventSub webhook registered');
  } catch (err) {
    console.error('❌ Failed to register EventSub:', err.response?.data || err.message);
  }
}

module.exports = {
  verifyTwitchSignature,
  registerEventSub
};
