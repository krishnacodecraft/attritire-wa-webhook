const express = require('express');
const https = require('https');
const path = require('path');
const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'attritire_wa_webhook_2026';
const PHONE_ID = process.env.PHONE_NUMBER_ID || '1267139103153025';
const TOKEN = process.env.ACCESS_TOKEN || '';
const messages = [];

function sendWAMessage(to, text) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      messaging_product: 'whatsapp', recipient_type: 'individual',
      to, type: 'text', text: { preview_url: false, body: text }
    });
    const req = https.request({
      hostname: 'graph.facebook.com', path: `/v25.0/${PHONE_ID}/messages`,
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      timeout: 8000
    }, (res) => {
      let body = ''; res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { reject(body); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(data); req.end();
  });
}

app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === VERIFY_TOKEN) return res.status(200).send(challenge);
  res.sendStatus(403);
});

app.post('/', (req, res) => {
  res.sendStatus(200);
  try {
    const entries = req.body?.entry || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        for (const msg of value.messages || []) {
          const contact = (value.contacts || []).find(c => c.wa_id === msg.from);
          messages.unshift({
            timestamp: new Date().toISOString(),
            from: msg.from, from_name: contact?.profile?.name || 'Unknown',
            type: msg.type, text: msg.type === 'text' ? msg.text?.body : '[media]',
            message_id: msg.id, direction: 'in'
          });
          if (messages.length > 500) messages.length = 500;
        }
      }
    }
  } catch (e) { console.error(e.message); }
});

app.get('/api/messages', (_, res) => res.json(messages));

app.get('/api/conversations', (_, res) => {
  const convs = {};
  messages.forEach(m => {
    const key = m.from;
    if (!convs[key]) convs[key] = { from: m.from, from_name: m.from_name, last_text: m.text, last_time: m.timestamp, count: 0 };
    convs[key].count++;
  });
  res.json(Object.values(convs).sort((a, b) => new Date(b.last_time) - new Date(a.last_time)));
});

app.get('/api/messages/:number', (req, res) => {
  res.json(messages.filter(m => m.from === req.params.number).reverse());
});

app.post('/api/send', async (req, res) => {
  const { to, text } = req.body;
  if (!to || !text) return res.status(400).json({ error: 'Missing to or text' });
  try {
    const result = await sendWAMessage(to, text);
    messages.unshift({
      timestamp: new Date().toISOString(),
      from: to, from_name: 'You', type: 'text', text,
      message_id: result.messages?.[0]?.id || 'sent', direction: 'out'
    });
    res.json({ success: true, result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/dashboard', (_, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/health', (_, res) => res.send('OK'));
app.get('/inbox', (_, res) => res.json({ messages }));

// === TABLLY WEBHOOK ===
app.post('/tablly-webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const data = req.body;
    console.log('📞 Tablly webhook received:', JSON.stringify(data).substring(0, 500));

    // Try to extract phone number and transcript
    const calledTo = data.called_to || data.to || data.phone_number || '';
    const transcript = data.call_transcript || data.transcript || '';
    const callStatus = data.call_status || data.status || '';
    const summary = data.call_summary || '';

    if (calledTo && transcript && transcript !== 'No Call Transcript Available') {
      // Send WhatsApp follow-up
      const waNumber = calledTo.replace(/[^0-9]/g, '');
      const summary = transcript.substring(0, 500);
      const waMsg = `📞 *Call Summary from Startup India*\n\nThank you for speaking with us! Here's a quick summary:\n\n"${summary}"\n\nReply to this message if you have any questions!`;

      await sendWAMessage(waNumber, waMsg);
      console.log(`✅ WhatsApp sent to ${waNumber} after Tablly call`);
    }
  } catch (e) { console.error('Tablly webhook error:', e.message); }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Startup India WhatsApp on port ${port}`));
module.exports = app;