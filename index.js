
const fs = require('fs');
const https = require('https');
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const configPath = './.config.json';
const keysPath = './keys.json';

// HTTPS sertifikaları
const privateKey = fs.readFileSync('./https_config/key.pem', 'utf8');
const certificate = fs.readFileSync('./https_config/cert.pem', 'utf8');
const credentials = { key: privateKey, cert: certificate };

// Express sunucu
const app = express();
app.use(express.json());

let config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath)) : {};
let keys = fs.existsSync(keysPath) ? JSON.parse(fs.readFileSync(keysPath)) : {};

// Token girişi
if (!config.token) {
    console.log("Telegram bot token girin:");
    process.stdin.once('data', (data) => {
        config.token = data.toString().trim();
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        initBot();
    });
} else {
    initBot();
}

// HTTPS sunucu /connect endpoint
app.get('/connect', (req, res) => {
    const { key, device_id } = req.query;
    if (!keys[key]) return res.status(404).json({ status: 'error', message: 'Key bulunamadı' });

    const now = Date.now();
    const keyData = keys[key];

    if (now > keyData.expires) return res.json({ status: 'expired' });

    if (!keyData.devices.includes(device_id)) {
        if (keyData.devices.length >= keyData.max_devices) return res.json({ status: 'device_limit' });
        keyData.devices.push(device_id);
    }

    fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2));
    const daysLeft = Math.floor((keyData.expires - now) / (1000 * 60 * 60 * 24));
    res.json({ status: 'success', key, days_left: daysLeft, devices_left: keyData.max_devices - keyData.devices.length });
});

https.createServer(credentials, app).listen(443, () => {
    console.log("HTTPS sunucu başlatıldı: https://127.0.0.1/connect");
});

// Telegram bot fonksiyonu
function initBot() {
    const bot = new TelegramBot(config.token, { polling: true });
    bot.onText(/\/create (.+) (\d+[dh]) (\d+)/, (msg, match) => {
        const [_, name, duration, maxDevices] = match;
        const now = Date.now();
        let timeMs = duration.includes('d') ? parseInt(duration) * 86400000 : parseInt(duration) * 3600000;
        keys[name] = { name, created: now, expires: now + timeMs, max_devices: parseInt(maxDevices), devices: [] };
        fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2));
        bot.sendMessage(msg.chat.id, `Key '${name}' oluşturuldu (${duration}, max ${maxDevices} cihaz)`);
    });

    bot.onText(/\/delete (.+)/, (msg, match) => {
        const name = match[1];
        if (keys[name]) {
            delete keys[name];
            fs.writeFileSync(keysPath, JSON.stringify(keys, null, 2));
            bot.sendMessage(msg.chat.id, `Key '${name}' silindi.`);
        } else {
            bot.sendMessage(msg.chat.id, "Key bulunamadı.");
        }
    });

    bot.onText(/\/list/, (msg) => {
        const list = Object.values(keys).map(k => `${k.name} - ${k.devices.length}/${k.max_devices} cihaz`).join("\n");
        bot.sendMessage(msg.chat.id, list || "Kayıtlı key yok.");
    });

    console.log("Telegram bot aktif.");
}
