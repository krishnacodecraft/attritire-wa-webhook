const express = require('express');
const https = require('https');
const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'attritire_wa_webhook_2026';
const PHONE_ID = process.env.PHONE_NUMBER_ID || '1267139103153025';
const TOKEN = process.env.ACCESS_TOKEN || '';
const messages = [];

function sendReply(to, text) {
  const data = JSON.stringify({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to, type: 'text',
    text: { preview_url: false, body: text }
  });
  const req = https.request({
    hostname: 'graph.facebook.com',
    path: `/v25.0/${PHONE_ID}/messages`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    },
    timeout: 8000
  }, (res) => {
    let body = '';
    res.on('data', d => body += d);
    res.on('end', () => {
      const r = JSON.parse(body);
      if (r.messages) console.log(`✅ Replied to ${to}: ${text}`);
      else console.error('Reply error:', body);
    });
  });
  req.on('error', e => console.error('Reply error:', e.message));
  req.on('timeout', () => { req.destroy(); console.error('Reply timeout'); });
  req.write(data);
  req.end();
}

app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook VERIFIED');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

app.post('/', (req, res) => {
  res.sendStatus(200); // Respond immediately to Meta
  try {
    const entries = req.body?.entry || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const msgs = value.messages || [];
        const contacts = value.contacts || [];
        for (const msg of msgs) {
          const contact = contacts.find(c => c.wa_id === msg.from);
          const incoming = {
            timestamp: new Date().toISOString(),
            from: msg.from,
            from_name: contact?.profile?.name || 'Unknown',
            type: msg.type,
            text: msg.type === 'text' ? msg.text?.body : '[non-text]',
            message_id: msg.id,
          };
          messages.push(incoming);
          console.log(`📩 ${incoming.from_name} (${incoming.from}): ${incoming.text}`);
          if (TOKEN && msg.type === 'text') {
            sendReply(msg.from, `Got it: "${msg.text.body}"`);
          }
        }
      }
    }
  } catch (e) {
    console.error('Parse error:', e.message);
  }
});

app.get('/health', (_, res) => res.send('OK'));
app.get('/inbox', (_, res) => res.json({ messages }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`📡 WhatsApp Webhook on port ${port}`));
module.exports = app;