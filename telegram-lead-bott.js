const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => { res.send('Bot is running!'); });
app.listen(port, () => { console.log(`Server listening at http://localhost:${port}`); });

// ============================================================
//  CONFIGURATION
// ============================================================
const TELEGRAM_TOKEN   = '8766071458:AAHQ_P5uQ_dyusYsRnkEoKPsWCB6mEK8KY4';
const WEBHOOK_URL      = 'https://hook.eu2.make.com/ox7k377smi1srcw731gkij7vehoxr3h5';
const CANAL_LINK       = 'https://t.me/+aB_kistPlmI3YTQ0';
const ID_LEO           = '1060253366'; 
// ============================================================

const TelegramBot = require('node-telegram-bot-api');
const axios       = require('axios');
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const sessions = {};
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  sessions[chatId] = { step: 'await_firstname' };

  bot.sendMessage(chatId, '👋 Bienvenue !\n\nComment tu t\'appelles ? Envoie-moi ton <b>prénom</b> 👇', { parse_mode: 'HTML' });

  const payloadStart = {
    telegram_id : msg.from.id,
    first_name  : msg.from.first_name || "Curieux",
    last_name   : msg.from.last_name || "", 
    username    : msg.from.username ? `@${msg.from.username}` : "Pas de pseudo", 
    email       : "aucun",
    text        : "/start" 
  };
  axios.post(WEBHOOK_URL, payloadStart).catch((err) => console.error('Erreur Webhook START'));
});

bot.on('message', (msg) => {
  const chatId  = msg.chat.id;
  const text    = msg.text ? msg.text.trim() : '';
  const session = sessions[chatId];

  if (!session || text.startsWith('/')) return;

  // ÉTAPE 1 : Prénom
  if (session.step === 'await_firstname') {
    if (!text || text.length < 2) return bot.sendMessage(chatId, '⚠️ Prénom trop court.');

    session.first_name = text;
    session.step       = 'await_email';

    // NOTIFICATION LÉO (Lien HTML bleu cliquable)
    const pseudo = msg.from.username ? ` (@${msg.from.username})` : "";
    const mentionLeo = `✅ <b>Nouveau prospect :</b> <a href="tg://user?id=${chatId}">${session.first_name}</a>${pseudo} vient de lancer le bot !`;
    
    bot.sendMessage(ID_LEO, mentionLeo, { parse_mode: 'HTML' })
       .catch((err) => console.error('Erreur notif Léo (Start)'));

    return bot.sendMessage(chatId, `Super, <b>${session.first_name}</b> ! 🙌\n\nMaintenant, quelle est ton adresse <b>email</b> ?`, { parse_mode: 'HTML' });
  }

  // ÉTAPE 2 : Email
  if (session.step === 'await_email') {
    if (!EMAIL_REGEX.test(text)) return bot.sendMessage(chatId, '⚠️ Email invalide. Réessaie 👇');

    session.email = text;

    bot.sendMessage(chatId, `🎉 Bienvenue <b>${session.first_name}</b> !\n\nTon accès au canal privé est prêt :\n👉 ${CANAL_LINK}`, { parse_mode: 'HTML' });

    // NOTIFICATION LÉO (Email reçu)
    bot.sendMessage(ID_LEO, `📧 <b>Email reçu :</b> ${session.first_name} a laissé son mail : <code>${session.email}</code>`, { parse_mode: 'HTML' });

    const payload = {
      telegram_id : msg.from.id,
      first_name  : session.first_name, 
      last_name   : msg.from.last_name || "", 
      username    : msg.from.username ? `@${msg.from.username}` : "Pas de pseudo",
      email       : session.email,
      text        : "email_recu"
    };

    axios.post(WEBHOOK_URL, payload).then(() => console.log(`Lead OK: ${payload.email}`)).catch((err) => console.error('Erreur Webhook Lead'));
    delete sessions[chatId];
  }
});

bot.on('polling_error', (err) => console.error('Polling error'));
console.log('🤖 Bot 100% prêt avec notifications HTML !');
