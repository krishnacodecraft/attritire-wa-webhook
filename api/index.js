const express = require('express');
const https = require('https');
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

// WhatsApp webhook verification
app.get('/', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook VERIFIED');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Incoming WhatsApp messages
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
            message_id: msg.id
          });
          if (messages.length > 200) messages.length = 200;
          console.log(`📩 ${messages[0].from_name}: ${messages[0].text}`);
        }
      }
    }
  } catch (e) { console.error('Parse error:', e.message); }
});

// API: get messages
app.get('/api/messages', (_, res) => res.json(messages));

// API: send message (for dashboard)
app.post('/api/send', async (req, res) => {
  const { to, text } = req.body;
  if (!to || !text) return res.status(400).json({ error: 'Missing to or text' });
  try {
    const result = await sendWAMessage(to, text);
    console.log(`✅ Sent to ${to}: ${text}`);
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Dashboard HTML
app.get('/dashboard', (_, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>WhatsApp Dashboard — Attritire</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Inter,system-ui,sans-serif;background:#f5f4f2;color:#1a1715;min-height:100vh}
.header{background:#fff;border-bottom:1px solid #e5e3df;padding:16px 24px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:10}
.header h1{font-family:'Playfair Display',serif;font-size:22px;display:flex;align-items:center;gap:8px}
.header .dot{width:8px;height:8px;background:#25D366;border-radius:50%;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.header .count{font-size:14px;color:#8b857f}
.container{max-width:800px;margin:0 auto;padding:24px}
.msg-card{background:#fff;border:1px solid #e5e3df;border-radius:12px;padding:20px 24px;margin-bottom:12px;transition:all .2s}
.msg-card:hover{border-color:#c4956a;box-shadow:0 2px 12px rgba(0,0,0,.06)}
.msg-meta{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.msg-from{font-weight:600;font-size:15px}
.msg-number{font-size:12px;color:#8b857f;margin-left:8px}
.msg-time{font-size:12px;color:#8b857f}
.msg-text{font-size:15px;color:#3a3632;line-height:1.6;margin-bottom:16px}
.reply-area{display:flex;gap:10px}
.reply-area input{flex:1;padding:10px 14px;border:1.5px solid #e5e3df;border-radius:8px;font-size:14px;font-family:Inter,sans-serif;outline:none;transition:border-color .2s}
.reply-area input:focus{border-color:#c4956a}
.reply-area button{padding:10px 20px;background:#25D366;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all .2s}
.reply-area button:hover{background:#1da851}
.reply-area button:disabled{opacity:.5;cursor:default}
.sent{background:#e8f5e9;padding:4px 10px;border-radius:999px;font-size:11px;color:#2e7d32;font-weight:600}
.empty{text-align:center;padding:60px 20px;color:#8b857f;font-size:16px}
.empty svg{width:48px;height:48px;margin-bottom:16px;opacity:.4}
.refresh{background:none;border:1px solid #e5e3df;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;color:#5c5750;transition:all .2s}
.refresh:hover{border-color:#c4956a;color:#c4956a}
</style>
</head>
<body>
<div class="header">
<h1>Attritire<span style="color:#c4956a">.</span> <span class="dot"></span></h1>
<div style="display:flex;align-items:center;gap:16px">
<span class="count" id="msgCount">0 messages</span>
<button class="refresh" onclick="loadMessages()">🔄 Refresh</button>
</div>
</div>
<div class="container" id="messages"><div class="empty">Loading messages...</div></div>
<script>
async function loadMessages() {
  const el = document.getElementById('messages');
  try {
    const res = await fetch('/api/messages');
    const msgs = await res.json();
    document.getElementById('msgCount').textContent = msgs.length + ' message' + (msgs.length !== 1 ? 's' : '');
    if (!msgs.length) { el.innerHTML = '<div class="empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><p>No messages yet. They will appear here when someone messages you.</p></div>'; return; }
    el.innerHTML = msgs.map((m,i) => '<div class="msg-card"><div class="msg-meta"><div><span class="msg-from">' + esc(m.from_name) + '</span><span class="msg-number">' + m.from + '</span></div><span class="msg-time">' + timeAgo(m.timestamp) + '</span></div><div class="msg-text">' + esc(m.text) + '</div><div class="reply-area"><input type="text" id="reply-'+i+'" placeholder="Type a reply..." onkeydown="if(event.key===\\'Enter\\')sendReply(\\''+m.from+'\\',\\'reply-'+i+'\\')"><button onclick="sendReply(\\''+m.from+'\\',\\'reply-'+i+'\\')">📤 Send</button></div></div>').join('');
  } catch(e) { el.innerHTML = '<div class="empty">⚠️ Could not load messages</div>'; }
}
function esc(s) { const d=document.createElement('div');d.textContent=s;return d.innerHTML; }
function timeAgo(ts) { const s=(Date.now()-new Date(ts).getTime())/1000; if(s<60)return 'just now';if(s<3600)return Math.floor(s/60)+'m ago';if(s<86400)return Math.floor(s/3600)+'h ago';return Math.floor(s/86400)+'d ago'; }
async function sendReply(to, inputId) {
  const inp = document.getElementById(inputId);
  const btn = inp.nextElementSibling;
  const text = inp.value.trim();
  if (!text) return;
  btn.disabled = true; btn.textContent = 'Sending...';
  try {
    const res = await fetch('/api/send', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({to,text}) });
    const data = await res.json();
    if (data.success) { inp.value = ''; btn.textContent = '✅ Sent'; setTimeout(()=>{btn.textContent='📤 Send';btn.disabled=false},2000); }
    else { btn.textContent = '❌ Failed'; btn.disabled = false; alert('Send failed: '+(data.error||'unknown')); }
  } catch(e) { btn.textContent = '❌ Error'; btn.disabled = false; }
}
loadMessages();
setInterval(loadMessages, 15000);
</script>
</body></html>`);
});

app.get('/health', (_, res) => res.send('OK'));
app.get('/inbox', (_, res) => res.json({ messages }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`📡 WhatsApp Webhook + Dashboard on port ${port}`));
module.exports = app;