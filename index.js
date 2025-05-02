const fs = require('fs');
const path = require('path');
const https = require('https');
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

// Token'ı saklayacağımız dosyanın yolu
const tokenFilePath = path.join(__dirname, 'telegram_token.txt');

// Bot token'ı dosyadan okuma
let telegramToken = '7578469284:AAGnxT8GYADYKJahPRg71XFNJg6cx6_W7Tc';

// Eğer token dosyası varsa, içeriğini oku
if (fs.existsSync(tokenFilePath)) {
  telegramToken = fs.readFileSync(tokenFilePath, 'utf8').trim();
  startBot();  // Token bulunduysa botu başlat
} else {
  // Eğer token yoksa, konsoldan al
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Telegram bot token\'ınızı girin: ', (token) => {
    telegramToken = token;
    // Token'ı dosyaya kaydet
    fs.writeFileSync(tokenFilePath, telegramToken);
    console.log('Token kaydedildi.');
    rl.close();
    startBot();  // Token alındıktan sonra botu başlat
  });
}

// Botu başlatan fonksiyon
function startBot() {
  // Sertifika dosyalarının yolu
  const keyPath = path.join(__dirname, 'https_config', 'key.pem');
  const certPath = path.join(__dirname, 'https_config', 'cert.pem');

  // Sertifikaları oku
  const privateKey = fs.readFileSync(keyPath, 'utf8');
  const certificate = fs.readFileSync(certPath, 'utf8');

  // HTTPS sunucusu oluştur
  const app = express();
  const server = https.createServer({ key: privateKey, cert: certificate }, app);

  // Telegram botu başlat
  const bot = new TelegramBot(telegramToken, { polling: true });

  // Sunucunun çalıştığı port
  const port = 8443;

  // Veritabanı (keys.json) dosyasının yolu
  const dbPath = path.join(__dirname, 'keys.json');

  // Veritabanını oku veya yeni oluştur
  let keyDB = fs.existsSync(dbPath) ? JSON.parse(fs.readFileSync(dbPath)) : { keys: [], usedKeys: [] };

  // Sunucu için JSON veri işleme
  app.use(express.json());

  // Test route
  app.get('/', (req, res) => {
    res.send('Lemon-Hax Key Server is running!');
  });

  // Key oluşturma komutu
  bot.onText(/\/create (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const [name, duration, maxDevices] = match[1].split(' ');

    const newKey = {
      name: name,
      duration: duration,
      maxDevices: parseInt(maxDevices),
      usedDevices: []
    };

    // Key veritabanına ekle
    keyDB.keys.push(newKey);
    fs.writeFileSync(dbPath, JSON.stringify(keyDB, null, 2));

    bot.sendMessage(chatId, `Yeni Key oluşturuldu: ${name} | Süre: ${duration} | Maksimum Cihaz: ${maxDevices}`);
  });

  // Key kullanım komutu
  bot.onText(/\/use_key (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const [keyName, deviceId] = match[1].split(' ');

    const key = keyDB.keys.find(k => k.name === keyName);
    if (!key) {
      bot.sendMessage(chatId, `Key bulunamadı: ${keyName}`);
      return;
    }

    if (key.usedDevices.includes(deviceId)) {
      bot.sendMessage(chatId, `Bu cihaz zaten kullanıyor: ${deviceId}`);
      return;
    }

    if (key.usedDevices.length < key.maxDevices) {
      key.usedDevices.push(deviceId);
      keyDB.usedKeys.push({
        keyName: keyName,
        deviceId: deviceId,
        date: new Date().toISOString()
      });

      fs.writeFileSync(dbPath, JSON.stringify(keyDB, null, 2));
      bot.sendMessage(chatId, `Key başarıyla kullanıldı: ${keyName} | Cihaz: ${deviceId}`);
    } else {
      bot.sendMessage(chatId, `Bu key için cihaz limiti aşıldı: ${keyName}`);
    }
  });

  // Key silme komutu (admin izinli)
  bot.onText(/\/delete (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const keyName = match[1];

    // Silme işlemi için admin kontrolü
    const adminId = 'YOUR_ADMIN_TELEGRAM_ID'; // Admin ID'sini buraya gir
    if (msg.from.id !== parseInt(adminId)) {
      bot.sendMessage(chatId, 'Bu komutu kullanma izniniz yok!');
      return;
    }

    const keyIndex = keyDB.keys.findIndex(k => k.name === keyName);
    if (keyIndex !== -1) {
      keyDB.keys.splice(keyIndex, 1);
      keyDB.usedKeys = keyDB.usedKeys.filter(entry => entry.keyName !== keyName);
      fs.writeFileSync(dbPath, JSON.stringify(keyDB, null, 2));
      bot.sendMessage(chatId, `Key silindi: ${keyName}`);
    } else {
      bot.sendMessage(chatId, `Key bulunamadı: ${keyName}`);
    }
  });

  // Key listeleme komutu
  bot.onText(/\/list_keys/, (msg) => {
    const chatId = msg.chat.id;

    if (keyDB.keys.length === 0) {
      bot.sendMessage(chatId, 'Henüz oluşturulmuş key bulunmamaktadır.');
    } else {
      let keyList = 'Oluşturulmuş Keyler:\n';
      keyDB.keys.forEach(key => {
        keyList += `- ${key.name} | Durum: ${key.duration} | Maksimum Cihaz: ${key.maxDevices} | Kullanıcılar: ${key.usedDevices.length}\n`;
      });
      bot.sendMessage(chatId, keyList);
    }
  });

  // Key kullanan cihazları listeleme komutu
  bot.onText(/\/used_keys/, (msg) => {
    const chatId = msg.chat.id;

    if (keyDB.usedKeys.length === 0) {
      bot.sendMessage(chatId, 'Hiçbir key kullanılmadı.');
    } else {
      let usedKeysList = 'Keyler ve Kullanıcılar:\n';
      keyDB.usedKeys.forEach(entry => {
        usedKeysList += `Key: ${entry.keyName} | Kullanıcı: ${entry.deviceId} | Tarih: ${entry.date}\n`;
      });
      bot.sendMessage(chatId, usedKeysList);
    }
  });

  // Sunucuyu başlat
  server.listen(port, () => {
    console.log(`Server started on https://localhost:${port}`);
  });
             }
