const express = require('express');
const https = require('https');
const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || 'attritire_wa_webhook_2026';
const PHONE_ID = process.env.PHONE_NUMBER_ID || '1267139103153025';
const TOKEN = process.env.ACCESS_TOKEN || '';
const messages = []; // {timestamp,from,from_name,type,text,message_id,direction:'in'|'out'}

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
            message_id: msg.id, direction: 'in'
          });
          if (messages.length > 500) messages.length = 500;
        }
      }
    }
  } catch (e) { console.error('Parse error:', e.message); }
});

// API: get all messages
app.get('/api/messages', (_, res) => res.json(messages));

// API: get conversations list
app.get('/api/conversations', (_, res) => {
  const convs = {};
  messages.forEach(m => {
    const key = m.from;
    if (!convs[key]) convs[key] = { from: m.from, from_name: m.from_name, last_text: m.text, last_time: m.timestamp, count: 0 };
    convs[key].count++;
  });
  const list = Object.values(convs).sort((a, b) => new Date(b.last_time) - new Date(a.last_time));
  res.json(list);
});

// API: get messages for specific contact
app.get('/api/messages/:number', (req, res) => {
  const msgs = messages.filter(m => m.from === req.params.number).reverse();
  res.json(msgs);
});

// API: send message
app.post('/api/send', async (req, res) => {
  const { to, text } = req.body;
  if (!to || !text) return res.status(400).json({ error: 'Missing to or text' });
  try {
    const result = await sendWAMessage(to, text);
    messages.unshift({
      timestamp: new Date().toISOString(),
      from: to, from_name: 'You',
      type: 'text', text, message_id: result.messages?.[0]?.id || 'sent',
      direction: 'out'
    });
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
<title>Messages — Startup India</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Inter,system-ui,sans-serif;background:#111b21;color:#e9edef;height:100vh;overflow:hidden;display:flex}
.sidebar{width:380px;min-width:380px;background:#111b21;border-right:1px solid #222d34;display:flex;flex-direction:column}
.sidebar-header{background:#202c33;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;min-height:60px}
.sidebar-header h2{font-size:16px;font-weight:600;color:#e9edef;display:flex;align-items:center;gap:8px}
.sidebar-header .green-dot{width:10px;height:10px;background:#25d366;border-radius:50%;animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
.sidebar-header .subtitle{font-size:11px;color:#8696a0;font-weight:400}
.conv-list{flex:1;overflow-y:auto}
.conv-item{padding:14px 16px;display:flex;align-items:center;gap:14px;cursor:pointer;border-bottom:1px solid #222d34;transition:background .15s}
.conv-item:hover{background:#202c33}
.conv-item.active{background:#2a3942}
.conv-avatar{width:48px;height:48px;min-width:48px;background:#2a3942;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:600;color:#aebac1}
.conv-info{flex:1;min-width:0}
.conv-name{font-size:16px;font-weight:500;margin-bottom:3px}
.conv-last{font-size:13px;color:#8696a0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.conv-meta{text-align:right;min-width:50px}
.conv-time{font-size:11px;color:#8696a0;margin-bottom:4px}
.conv-badge{display:inline-block;background:#25d366;color:#111b21;font-size:11px;font-weight:700;padding:2px 7px;border-radius:999px;min-width:20px;text-align:center}
.main{flex:1;display:flex;flex-direction:column;background:#0b141a}
.chat-header{background:#202c33;padding:14px 20px;display:flex;align-items:center;gap:14px;min-height:60px}
.chat-header .chat-avatar{width:40px;height:40px;background:#2a3942;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600}
.chat-header .chat-name{font-size:16px;font-weight:500}
.chat-header .chat-number{font-size:12px;color:#8696a0}
.chat-body{flex:1;overflow-y:auto;padding:20px 60px;background:url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 30 L60 30 L60 60 L30 60z' fill='none' stroke='%23222d34' stroke-width='0.5'/%3E%3C/svg%3E") repeat}
.chat-footer{background:#202c33;padding:10px 16px;display:flex;align-items:center;gap:12px}
.chat-footer input{flex:1;padding:10px 16px;background:#2a3942;border:none;border-radius:8px;color:#e9edef;font-size:14px;font-family:Inter,sans-serif;outline:none}
.chat-footer input::placeholder{color:#8696a0}
.chat-footer button{background:#25d366;color:#111b21;border:none;border-radius:50%;width:44px;height:44px;min-width:44px;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;transition:all .15s}
.chat-footer button:hover{background:#1da851;transform:scale(1.05)}
.chat-footer button:disabled{opacity:.4;cursor:default;transform:none}
.msg-bubble{max-width:65%;margin-bottom:4px;padding:8px 12px;border-radius:8px;font-size:14px;line-height:1.5;position:relative;word-wrap:break-word}
.msg-in{background:#202c33;border-top-left-radius:0;margin-right:auto}
.msg-out{background:#005c4b;border-top-right-radius:0;margin-left:auto}
.msg-time{font-size:11px;color:#8696a0;margin-top:2px;text-align:right}
.msg-out .msg-time{color:#7dba92}
.empty-chat{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#8696a0;text-align:center;padding:40px}
.empty-chat svg{width:80px;height:80px;margin-bottom:20px;opacity:.5}
.empty-chat h3{font-size:20px;margin-bottom:8px;color:#e9edef}
.empty-chat p{font-size:14px;max-width:400px;line-height:1.6}
@media(max-width:768px){.sidebar{width:100%;min-width:100%}.main{display:none}.main.show{display:flex;position:fixed;inset:0;z-index:100}}
</style>
</head>
<body>
<div class="sidebar" id="sidebar">
<div class="sidebar-header">
<div><h2>Startup India<span class="green-dot"></span></h2><div class="subtitle">WhatsApp Chatbot</div></div>
<button onclick="loadConvs()" style="background:none;border:none;color:#8696a0;cursor:pointer;font-size:18px" title="Refresh">🔄</button>
</div>
<div class="conv-list" id="convList"><div style="padding:40px;text-align:center;color:#8696a0">Loading conversations...</div></div>
</div>
<div class="main" id="mainPanel">
<div class="empty-chat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg><h3>Startup India Chatbot</h3><p>Select a conversation from the left to start chatting. Incoming WhatsApp messages appear here automatically.</p></div>
</div>
<script>
let activeNumber = null;
async function loadConvs() {
  const el = document.getElementById('convList');
  try {
    const res = await fetch('/api/conversations');
    const convs = await res.json();
    if (!convs.length) { el.innerHTML = '<div style="padding:40px;text-align:center;color:#8696a0">No conversations yet.<br><small>Send a WhatsApp message to get started.</small></div>'; return; }
    el.innerHTML = convs.map(c => '<div class="conv-item'+(c.from===activeNumber?' active':'')+'" onclick="openChat(\\''+c.from+'\\',\\''+esc(c.from_name)+'\\')"><div class="conv-avatar">'+(c.from_name||'?')[0].toUpperCase()+'</div><div class="conv-info"><div class="conv-name">'+esc(c.from_name)+'</div><div class="conv-last">'+esc(c.last_text||'')+'</div></div><div class="conv-meta"><div class="conv-time">'+timeAgo(c.last_time)+'</div><div class="conv-badge">'+c.count+'</div></div></div>').join('');
  } catch(e) { el.innerHTML = '<div style="padding:40px;text-align:center;color:#8696a0">⚠️ Could not load</div>'; }
}
async function openChat(number, name) {
  activeNumber = number;
  const panel = document.getElementById('mainPanel');
  panel.innerHTML = '<div class="chat-header"><div class="chat-avatar">'+(name||'?')[0].toUpperCase()+'</div><div><div class="chat-name">'+esc(name)+'</div><div class="chat-number">'+number+'</div></div></div><div class="chat-body" id="chatBody"><div style="text-align:center;color:#8696a0;padding:20px">Loading...</div></div><div class="chat-footer"><input type="text" id="chatInput" placeholder="Type a message..." onkeydown="if(event.key===\\'Enter\\')sendMsg()"><button onclick="sendMsg()" id="sendBtn">▶</button></div>';
  panel.classList.add('show');
  await loadChat(number);
}
async function loadChat(number) {
  try {
    const res = await fetch('/api/messages/'+number);
    const msgs = await res.json();
    const el = document.getElementById('chatBody');
    if (!el) return;
    if (!msgs.length) { el.innerHTML = '<div style="text-align:center;color:#8696a0;padding:40px">No messages yet</div>'; return; }
    el.innerHTML = msgs.map(m => '<div class="msg-bubble msg-'+(m.direction==='out'?'out':'in')+'"><div>'+esc(m.text)+'</div><div class="msg-time">'+timeAgo(m.timestamp)+'</div></div>').join('');
    el.scrollTop = el.scrollHeight;
  } catch(e) {}
}
async function sendMsg() {
  const inp = document.getElementById('chatInput');
  const btn = document.getElementById('sendBtn');
  const text = inp.value.trim();
  if (!text || !activeNumber) return;
  btn.disabled = true;
  try {
    await fetch('/api/send', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({to:activeNumber,text}) });
    inp.value = '';
    await loadChat(activeNumber);
    await loadConvs();
  } catch(e) {}
  btn.disabled = false;
}
function esc(s) { const d=document.createElement('div');d.textContent=s;return d.innerHTML; }
function timeAgo(ts) { const s=(Date.now()-new Date(ts).getTime())/1000; if(s<60)return 'now';if(s<3600)return Math.floor(s/60)+'m';if(s<86400)return Math.floor(s/3600)+'h';return Math.floor(s/86400)+'d'; }
loadConvs();
setInterval(() => { loadConvs(); if(activeNumber) loadChat(activeNumber); }, 10000);
</script>
</body></html>`);
});

app.get('/health', (_, res) => res.send('OK'));
app.get('/inbox', (_, res) => res.json({ messages }));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`📡 Startup India WhatsApp on port ${port}`));
module.exports = app;