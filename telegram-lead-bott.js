
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Serveur keep-alive pour Render
app.get('/', (req, res) => { 
  res.send('Bot is running!'); 
});

app.listen(port, () => { 
  console.log(`✅ Keep-alive server sur http://localhost:${port}`); 
});

// ============================================================
//  CONFIGURATION
// ============================================================
const TELEGRAM_TOKEN   = process.env.TELEGRAM_TOKEN || '8766071458:AAHQ_P5uQ_dyusYsRnkEoKPsWCB6mEK8KY4';
const WEBHOOK_URL      = process.env.WEBHOOK_URL || 'https://hook.eu2.make.com/ox7k377smi1srcw731gkij7vehoxr3h5';
const CANAL_LINK       = 'https://t.me/+E8-N241k708zZGFk';
const ID_LEO           = '1060253366'; 
// ============================================================

const TelegramBot = require('node-telegram-bot-api');
const axios       = require('axios');

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// Stockage des sessions utilisateurs
const sessions = {};

// Regex validation email
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Configuration axios pour tous les appels webhook
const axiosConfig = {
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000, // 10 secondes max
};

// ---------------------------------------------------------------
// COMMANDE /start
// ---------------------------------------------------------------
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Initialiser la session
  sessions[chatId] = { step: 'await_firstname' };
  
  // Message de bienvenue
  bot.sendMessage(
    chatId, 
    '👋 Bienvenue !\n\nComment tu t\'appelles ? Envoie-moi ton <b>prénom</b> 👇', 
    { parse_mode: 'HTML' }
  );
  
  // Webhook START
  const payloadStart = {
    telegram_id : userId,
    first_name  : msg.from.first_name || "Curieux",
    last_name   : msg.from.last_name || "", 
    username    : msg.from.username ? `@${msg.from.username}` : "Pas de pseudo", 
    email       : "aucun",
    text        : "/start" 
  };
  
  axios.post(WEBHOOK_URL, payloadStart, axiosConfig)
    .then(() => console.log(`📡 Webhook START envoyé pour User ${userId}`))
    .catch((err) => console.error(`❌ Erreur webhook START: ${err.message}`));
});

// ---------------------------------------------------------------
// GESTION DES MESSAGES
// ---------------------------------------------------------------
bot.on('message', (msg) => {
  const chatId  = msg.chat.id;
  const userId  = msg.from.id; // 🚨 ID de l'utilisateur (pas du chat)
  const text    = msg.text ? msg.text.trim() : '';
  const session = sessions[chatId];
  
  // Ignorer si pas de session ou commande
  if (!session || text.startsWith('/')) return;
  
  // ═══════════════════════════════════════════════════════════
  // ÉTAPE 1 : PRÉNOM
  // ═══════════════════════════════════════════════════════════
  if (session.step === 'await_firstname') {
    
    // Validation prénom
    if (!text || text.length < 2) {
      return bot.sendMessage(chatId, '⚠️ Prénom trop court. Essaie à nouveau 👇');
    }
    
    session.first_name = text;
    session.step = 'await_email';
    
    // 🚨 NOTIFICATION LÉO avec lien cliquable (corrigé avec userId)
    const pseudo = msg.from.username ? ` (@${msg.from.username})` : "";
    const mentionLeo = `✅ <b>Nouveau prospect :</b> <a href="tg://user?id=${userId}">${session.first_name}</a>${pseudo} vient de lancer le bot !`;
    
    bot.sendMessage(ID_LEO, mentionLeo, { parse_mode: 'HTML' })
      .then(() => console.log(`📲 Notif Léo envoyée pour ${session.first_name}`))
      .catch((err) => console.error(`❌ Erreur notif Léo (Start): ${err.message}`));
    
    // Message suivant à l'utilisateur
    return bot.sendMessage(
      chatId, 
      `Super, <b>${session.first_name}</b> ! 🙌\n\nMaintenant, quelle est ton adresse <b>email</b> ?`, 
      { parse_mode: 'HTML' }
    );
  }
  
  // ═══════════════════════════════════════════════════════════
  // ÉTAPE 2 : EMAIL
  // ═══════════════════════════════════════════════════════════
  if (session.step === 'await_email') {
    
    // Validation email
    if (!EMAIL_REGEX.test(text)) {
      return bot.sendMessage(
        chatId, 
        '⚠️ Ce format d\'email ne semble pas valide.\n\nExemple : <code>prenom@domaine.com</code>\n\nRéessaie 👇',
        { parse_mode: 'HTML' }
      );
    }
    
    session.email = text;
    
    // Message de confirmation à l'utilisateur
    bot.sendMessage(
      chatId, 
      `🎉 Bienvenue <b>${session.first_name}</b> !\n\nTon accès au canal privé est prêt :\n👉 ${CANAL_LINK}`, 
      { parse_mode: 'HTML' }
    );
    
    // 🚨 NOTIFICATION LÉO (Email reçu)
    const emailNotif = `📧 <b>Email reçu :</b> ${session.first_name} a laissé son mail : <code>${session.email}</code>`;
    
    bot.sendMessage(ID_LEO, emailNotif, { parse_mode: 'HTML' })
      .then(() => console.log(`📧 Notif email envoyée à Léo pour ${session.first_name}`))
      .catch((err) => console.error(`❌ Erreur notif Léo (Email): ${err.message}`));
    
    // Webhook LEAD
    const payload = {
      telegram_id : userId,
      first_name  : session.first_name, 
      last_name   : msg.from.last_name || "", 
      username    : msg.from.username ? `@${msg.from.username}` : "Pas de pseudo",
      email       : session.email,
      text        : "email_recu"
    };
    
    axios.post(WEBHOOK_URL, payload, axiosConfig)
      .then(() => console.log(`✅ Lead envoyé → ${payload.email}`))
      .catch((err) => console.error(`❌ Erreur webhook LEAD: ${err.message}`));
    
    // Nettoyer la session
    delete sessions[chatId];
  }
});

// ---------------------------------------------------------------
// GESTION DES ERREURS
// ---------------------------------------------------------------
bot.on('polling_error', (err) => {
  console.error(`❌ Polling error: ${err.message}`);
});

// ---------------------------------------------------------------
// DÉMARRAGE
// ---------------------------------------------------------------
console.log('🤖 Bot 100% opérationnel avec notifications HTML optimisées !');
console.log('📱 Prêt à recevoir des messages...');
