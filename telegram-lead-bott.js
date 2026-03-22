const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Serveur pour que Render ne coupe pas le bot
app.get('/', (req, res) => {
  res.send('Bot is running!');
});

app.listen(port, () => {
  console.log(`Keep-alive server listening at http://localhost:${port}`);
});

// ============================================================
//  CONFIGURATION — à modifier avant de lancer le bot
// ============================================================
const TELEGRAM_TOKEN   = '8766071458:AAHQ_P5uQ_dyusYsRnkEoKPsWCB6mEK8KY4';
const WEBHOOK_URL      = 'https://hook.eu2.make.com/ox7k377smi1srcw731gkij7vehoxr3h5';
const CANAL_LINK       = 'https://t.me/+aB_kistPlmI3YTQ0';
const ID_LEO           = '1060253366'; // L'ID de Léo pour les notifications
// ============================================================

const TelegramBot = require('node-telegram-bot-api');
const axios       = require('axios');

// Initialisation du bot en mode polling
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Stockage des sessions
const sessions = {};

// Regex de validation d'email
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------
// /start — point d'entrée du tunnel
// ---------------------------------------------------------------
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  // Réinitialise la session
  sessions[chatId] = { step: 'await_firstname' };

  bot.sendMessage(chatId, '👋 Bienvenue !\n\nComment tu t\'appelles ? Envoie-moi ton *prénom* 👇', {
    parse_mode: 'Markdown',
  });

  // ── ENVOI DE LA STAT "/start" À MAKE ──────────────────────────
  const payloadStart = {
    telegram_id : msg.from.id,
    first_name  : msg.from.first_name || "Curieux",
    last_name   : msg.from.last_name || "", 
    username    : msg.from.username ? `@${msg.from.username}` : "Pas de pseudo", 
    email       : "aucun",
    text        : "/start" 
  };

  axios.post(WEBHOOK_URL, payloadStart, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 10_000,
  }).catch((err) => {
    console.error('❌ Erreur envoi webhook START :', err.message);
  });
});

// ---------------------------------------------------------------
// Gestion des étapes
// ---------------------------------------------------------------
bot.on('message', (msg) => {
  const chatId  = msg.chat.id;
  const text    = msg.text ? msg.text.trim() : '';
  const session = sessions[chatId];

  if (!session || text.startsWith('/')) return;

  // ÉTAPE 1 : Prénom (Moment où on notifie Léo)
  if (session.step === 'await_firstname') {
    if (!text || text.length < 2) {
      return bot.sendMessage(chatId, '⚠️ Prénom trop court. Essaie à nouveau 👇');
    }

    session.first_name = text;
    session.step       = 'await_email';

    // 🚨 NOTIFICATION POUR LÉO : Il reçoit le prénom en direct
    bot.sendMessage(ID_LEO, `✅ Nouveau prospect en cours : *${session.first_name}* vient de donner son prénom !`, { parse_mode: 'Markdown' })
       .catch((err) => console.error('Erreur notif Léo (Léo a-t-il fait /start sur le bot ?) :', err.message));

    return bot.sendMessage(
      chatId,
      `Super, *${session.first_name}* ! 🙌\n\nMaintenant, quelle est ton adresse *email* ?`,
      { parse_mode: 'Markdown' }
    );
  }

  // ÉTAPE 2 : Email
  if (session.step === 'await_email') {
    if (!EMAIL_REGEX.test(text)) {
      return bot.sendMessage(
        chatId,
        '⚠️ Ce format d\'email ne semble pas valide.\nExemple attendu : *prenom@domaine.com*\n\nRéessaie 👇',
        { parse_mode: 'Markdown' }
      );
    }

    session.email = text;

    // UX : Lien envoyé direct
    bot.sendMessage(
      chatId,
      `🎉 Bienvenue *${session.first_name}* !\n\nTon accès au canal privé est prêt :\n👉 ${CANAL_LINK}`,
      { parse_mode: 'Markdown' }
    );

    // ENVOI LEAD FINAL À MAKE
    const payload = {
      telegram_id : msg.from.id,
      first_name  : session.first_name, 
      last_name   : msg.from.last_name || "", 
      username    : msg.from.username ? `@${msg.from.username}` : "Pas de pseudo",
      email       : session.email,
      text        : "email_recu"
    };

    axios.post(WEBHOOK_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10_000,
    })
      .then(() => {
        console.log(`✅ Lead envoyé → ${payload.email}`);
      })
      .catch((err) => {
        console.error('❌ Erreur envoi webhook :', err.message);
      });

    delete sessions[chatId];
  }
});

bot.on('polling_error', (err) => console.error('Polling error :', err.message));
console.log('🤖 Bot démarré avec Express (Port ' + port + ') et Notifications Léo activées...');
