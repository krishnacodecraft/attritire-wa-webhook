#!/usr/bin/env python3
"""WhatsApp Webhook Server — Render deployment"""
import json, os
from datetime import datetime
from flask import Flask, request

app = Flask(__name__)

VERIFY_TOKEN = os.environ.get("VERIFY_TOKEN", "attritire_wa_webhook_2026")
PHONE_NUMBER_ID = os.environ.get("PHONE_NUMBER_ID", "1267139103153025")
ACCESS_TOKEN = os.environ.get("ACCESS_TOKEN", "")
MESSAGES_FILE = "/tmp/wa_messages.json"

@app.route("/", methods=["GET"])
def verify():
    """Meta webhook verification"""
    mode = request.args.get("hub.mode")
    token = request.args.get("hub.verify_token")
    challenge = request.args.get("hub.challenge")
    if mode == "subscribe" and token == VERIFY_TOKEN:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] ✅ Webhook VERIFIED")
        return challenge, 200
    return "Forbidden", 403

@app.route("/", methods=["POST"])
def webhook():
    """Receive incoming WhatsApp messages"""
    data = request.get_json()
    try:
        entries = data.get("entry", [])
        for entry in entries:
            for change in entry.get("changes", []):
                value = change.get("value", {})
                messages = value.get("messages", [])
                contacts = value.get("contacts", [])

                for msg in messages:
                    contact_name = ""
                    for c in contacts:
                        if c.get("wa_id") == msg.get("from"):
                            contact_name = c.get("profile", {}).get("name", "")
                            break

                    incoming = {
                        "timestamp": datetime.now().isoformat(),
                        "from": msg.get("from"),
                        "from_name": contact_name,
                        "type": msg.get("type"),
                        "text": msg.get("text", {}).get("body", "") if msg.get("type") == "text" else "[non-text]",
                        "message_id": msg.get("id"),
                    }

                    # Save to file
                    messages_list = []
                    if os.path.exists(MESSAGES_FILE):
                        with open(MESSAGES_FILE) as f:
                            messages_list = json.load(f)
                    messages_list.append(incoming)
                    with open(MESSAGES_FILE, "w") as f:
                        json.dump(messages_list, f, indent=2)

                    print(f"\n{'='*60}")
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] 📩 NEW MESSAGE!")
                    print(f"From: {contact_name} ({incoming['from']})")
                    print(f"Text: {incoming['text']}")
                    print(f"{'='*60}\n")

                    # Auto-reply with echo
                    if ACCESS_TOKEN and incoming["type"] == "text":
                        send_reply(incoming["from"], f"Got your message: {incoming['text']}")
    except Exception as e:
        print(f"[ERROR] {e}")

    return "OK", 200

def send_reply(to, text):
    """Send a reply back via WhatsApp API"""
    import urllib.request
    url = f"https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/messages"
    payload = json.dumps({
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "text",
        "text": {"preview_url": False, "body": text[:1000]}
    }).encode()
    req = urllib.request.Request(url, data=payload, headers={
        "Authorization": f"Bearer {ACCESS_TOKEN}",
        "Content-Type": "application/json"
    })
    urllib.request.urlopen(req)

@app.route("/health", methods=["GET"])
def health():
    return "OK", 200

@app.route("/inbox", methods=["GET"])
def inbox():
    """View received messages"""
    if os.path.exists(MESSAGES_FILE):
        with open(MESSAGES_FILE) as f:
            return {"messages": json.load(f)}
    return {"messages": []}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8090))
    print(f"📡 WhatsApp Webhook starting on port {port}")
    app.run(host="0.0.0.0", port=port)
