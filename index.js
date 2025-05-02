const fs = require('fs');
const path = require('path');
const https = require('https');
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');

// Telegram bot token'ını buraya yazın
const telegramToken = 'YOUR_TELEGRAM_BOT_TOKEN';

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
  const [name, duration, maxDevices] = match[1].split(' '
                                                      // Key kullanımını kontrol et ve ekle
bot.onText(/\/use_key (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const [keyName, deviceId] = match[1].split(' ');

  // Key'i veritabanında bul
  const key = keyDB.keys.find(k => k.name === keyName);
  if (!key) {
    bot.sendMessage(chatId, `Key bulunamadı: ${keyName}`);
    return;
  }

  // Eğer cihaz zaten kullanıyorsa, tekrar eklenmesin
  if (key.usedDevices.includes(deviceId)) {
    bot.sendMessage(chatId, `Bu cihaz zaten kullanıyor: ${deviceId}`);
    return;
  }

  // Key limitine ulaşılmadıysa cihaz ekle
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

// Key silme komutu (sadece admin izinli)
bot.onText(/\/delete (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const keyName = match[1];

  // Silme işlemi için admin kontrolü
  const adminId = 'YOUR_ADMIN_TELEGRAM_ID'; // Admin ID'sini buraya gir
  if (msg.from.id !== parseInt(adminId)) {
    bot.sendMessage(chatId, 'Bu komutu kullanma izniniz yok!');
    return;
  }

  // Key'i bul ve sil
  const keyIndex = keyDB.keys.findIndex(k => k.name === keyName);
  if (keyIndex !== -1) {
    keyDB.keys.splice(keyIndex, 1);
    // Key kullanılmışsa, tüm kayıtları temizle
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

// Yeni bir cihaz ekleme komutu (admin özelliği)
bot.onText(/\/add_device (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const [keyName, deviceId] = match[1].split(' ');

  // Admin kontrolü
  const adminId = 'YOUR_ADMIN_TELEGRAM_ID'; // Admin ID'sini buraya yaz
  if (msg.from.id !== parseInt(adminId)) {
    bot.sendMessage(chatId, 'Bu komutu kullanma izniniz yok!');
    return;
  }

  // Key'i bul
  const key = keyDB.keys.find(k => k.name === keyName);
  if (!key) {
    bot.sendMessage(chatId, `Key bulunamadı: ${keyName}`);
    return;
  }

  // Key limitine ulaşılmadıysa, cihaz ekleyelim
  if (key.usedDevices.length < key.maxDevices) {
    key.usedDevices.push(deviceId);
    keyDB.usedKeys.push({
      keyName: keyName,
      deviceId: deviceId,
      date: new Date().toISOString()
    });
    fs.writeFileSync(dbPath, JSON.stringify(keyDB, null, 2));
    bot.sendMessage(chatId, `Yeni cihaz başarıyla eklenmiştir: ${deviceId}`);
  } else {
    bot.sendMessage(chatId, `Key limitine ulaşıldığı için cihaz eklenemedi: ${keyName}`);
  }
});

// Sunucuyu başlat
server.listen(port, () => {
  console.log(`Server started on https://localhost:${port}`);
});
