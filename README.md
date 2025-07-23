# Twitch EventSub OBS Alerts Backend

This backend listens to Twitch EventSub notifications for follows, subs, bits, and raids, and emits messages to OBS via WebSocket.

## Deployment
Deploy it on Render and configure the following environment variables:
- `EVENTSUB_SECRET`
- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`
- `TWITCH_USER_ID`