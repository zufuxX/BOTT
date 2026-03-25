const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Keep-alive server for Render
app.get('/', (req, res) => { 
  res.send('Bot is running!'); 
});

app.listen(port, () => { 
  console.log(`✅ Keep-alive server on http://localhost:${port}`); 
});

// ============================================================
//  CONFIGURATION
// ============================================================
const TELEGRAM_TOKEN   = process.env.TELEGRAM_TOKEN || '8504929814:AAGLp1eqUQk_6s22hobwrQe-yAumDkAg00w';
const WEBHOOK_URL      = process.env.WEBHOOK_URL || 'https://hook.eu2.make.com/ox7k377smi1srcw731gkij7vehoxr3h5';
const CANAL_LINK       = 'https://t.me/+E8-N241k708zZGFk';
const ID_LEO           = '1060253366'; 
// ============================================================

const TelegramBot = require('node-telegram-bot-api');
const axios       = require('axios');

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// User sessions storage
const sessions = {};

// Cooldown storage (prevent duplicate webhooks)
const webhookCooldown = {};

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Axios config for all webhook calls
const axiosConfig = {
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
};

// ---------------------------------------------------------------
// COMMANDE /start
// ---------------------------------------------------------------
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Initialize session
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

  // ⏱️ RELANCE AUTOMATIQUE APRÈS 15 MINUTES (Prénom manquant)
  setTimeout(() => {
    // Le bot vérifie s'il est à la bonne étape ET s'il n'a pas DÉJÀ envoyé la relance
    if (sessions[chatId] && sessions[chatId].step === 'await_firstname' && !sessions[chatId].relance_prenom_faite) {
      
      // On met le coup de tampon pour bloquer les prochains chronomètres fantômes
      sessions[chatId].relance_prenom_faite = true; 
      
      bot.sendMessage(
        chatId, 
        '👀 Coucou ! Je vois que tu t\'es arrêté(e) en chemin.\n\nQuel est ton <b>prénom</b> pour continuer ? 👇', 
        { parse_mode: 'HTML' }
      ).catch((err) => console.log(`🛑 Relance annulée : L'utilisateur ${userId} a bloqué le bot.`));
      
      console.log(`⏰ Relance envoyée à l'utilisateur ${userId} (Prénom manquant)`);
    }
  }, 15 * 60 * 1000); // 15 minutes
});

// ---------------------------------------------------------------
// GESTION DES MESSAGES
// ---------------------------------------------------------------
bot.on('message', (msg) => {
  const chatId  = msg.chat.id;
  const userId  = msg.from.id; 
  const text    = msg.text ? msg.text.trim() : '';
  const session = sessions[chatId];
  
  // Ignore if no session or if it's a command
  if (!session || text.startsWith('/')) return;
  
  // ═══════════════════════════════════════════════════════════
  // ÉTAPE 1 : PRÉNOM
  // ═══════════════════════════════════════════════════════════
  if (session.step === 'await_firstname') {
    
    if (!text || text.length < 2) {
      return bot.sendMessage(chatId, '⚠️ Prénom trop court. Essaie à nouveau 👇');
    }
    
    session.first_name = text;
    session.step = 'await_email';
    
    // NOTIFICATION LÉO
    const pseudo = msg.from.username ? ` (@${msg.from.username})` : "";
    const mentionLeo = `✅ <b>Nouveau prospect :</b> <a href="tg://user?id=${userId}">${session.first_name}</a>${pseudo} vient de lancer le bot !`;
    
    bot.sendMessage(ID_LEO, mentionLeo, { parse_mode: 'HTML' })
      .then(() => console.log(`📲 Notif Léo envoyée pour ${session.first_name}`))
      .catch((err) => console.error(`❌ Erreur notif Léo (Start): ${err.message}`));
    
    bot.sendMessage(
      chatId, 
      `Super, <b>${session.first_name}</b> ! 🙌\n\nMaintenant, quelle est ton adresse <b>email</b> ?`, 
      { parse_mode: 'HTML' }
    );

    // ⏱️ RELANCE AUTOMATIQUE APRÈS 15 MINUTES (Email manquant)
    setTimeout(() => {
      // Le bot vérifie s'il est à la bonne étape ET s'il n'a pas DÉJÀ envoyé la relance
      if (sessions[chatId] && sessions[chatId].step === 'await_email' && !sessions[chatId].relance_email_faite) {
        
        // On met le coup de tampon
        sessions[chatId].relance_email_faite = true;
        
        bot.sendMessage(
          chatId, 
          `⏳ On y est presque, <b>${session.first_name}</b> !\n\nIl ne manque plus que ton <b>email</b> pour te donner l'accès au canal privé. 👇`, 
          { parse_mode: 'HTML' }
        ).catch((err) => console.log(`🛑 Relance annulée : ${session.first_name} a bloqué le bot.`));
        
        console.log(`⏰ Relance envoyée à ${session.first_name} (Email manquant)`);
      }
    }, 15 * 60 * 1000); // 15 minutes

    return; // Très important pour ne pas passer directement à l'étape email !
  }
  
  // ═══════════════════════════════════════════════════════════
  // ÉTAPE 2 : EMAIL ET LIEN DU CANAL
  // ═══════════════════════════════════════════════════════════
  if (session.step === 'await_email') {
    
    if (!EMAIL_REGEX.test(text)) {
      return bot.sendMessage(
        chatId, 
        '⚠️ Ce format d\'email ne semble pas valide.\n\nExemple : <code>prenom@domaine.com</code>\n\nRéessaie 👇',
        { parse_mode: 'HTML' }
      );
    }
    
    session.email = text;
    const firstNameBackup = session.first_name; // On sauvegarde le prénom pour la relance 30 min plus tard
    
    // Message de confirmation & lien
    bot.sendMessage(
      chatId, 
      `🎉 Bienvenue <b>${session.first_name}</b> !\n\nTon accès au canal privé est prêt :\n👉 ${CANAL_LINK}`, 
      { parse_mode: 'HTML' }
    );
    
    // NOTIFICATION LÉO (Email reçu)
    const emailNotif = `📧 <b>Email reçu :</b> ${session.first_name} a laissé son mail : <code>${session.email}</code>`;
    
    bot.sendMessage(ID_LEO, emailNotif, { parse_mode: 'HTML' })
      .then(() => console.log(`📧 Notif email envoyée à Léo pour ${session.first_name}`))
      .catch((err) => console.error(`❌ Erreur notif Léo (Email): ${err.message}`));
    
    // Webhook LEAD avec cooldown 30 secondes
    const now = Date.now();
    const lastSent = webhookCooldown[userId] || 0;
    
    if (now - lastSent > 30 * 1000) {
      webhookCooldown[userId] = now;
      
      const payload = {
        telegram_id : userId,
        first_name  : session.first_name, 
        last_name   : msg.from.last_name || "", 
        username    : msg.from.username ? `@${msg.from.username}` : "Pas de pseudo",
        email       : session.email,
        text        : "email_received" // ⚠️ Ne pas traduire pour ne pas casser Make !
      };
      
      axios.post(WEBHOOK_URL, payload, axiosConfig)
        .then(() => console.log(`✅ Lead envoyé → ${payload.email}`))
        .catch((err) => console.error(`❌ Erreur webhook LEAD: ${err.message}`));
    } else {
      console.log(`⏱️ Cooldown actif pour User ${userId} - webhook ignoré`);
    }
    
    // On nettoie la session de discussion car l'inscription est finie
    delete sessions[chatId];

    // ═══════════════════════════════════════════════════════════
    // ⏱️ RELANCE DES 30 MINUTES (A-T-IL REJOINT LE GROUPE ?)
    // ═══════════════════════════════════════════════════════════
    setTimeout(() => {
      const options = {
        parse_mode: 'HTML',
        reply_markup: JSON.stringify({
          inline_keyboard: [
            [{ text: '✅ Oui, c\'est bon !', callback_data: 'joined_yes' }],
            [{ text: '❌ Non, pas encore', callback_data: 'joined_no' }]
          ]
        })
      };

      bot.sendMessage(
        chatId,
        `Coucou <b>${firstNameBackup}</b> ! Ça fait une petite demi-heure qu'on a discuté... ⏱️\n\nAs-tu réussi à rejoindre le canal privé ?`,
        options
      ).catch((err) => console.log(`🛑 Relance 30m annulée (Bot bloqué par l'utilisateur).`));
      
      console.log(`⏰ Relance +30min envoyée à ${firstNameBackup} (A rejoint le groupe ?)`);
      
    }, 1 * 60 * 1000); // 30 minutes
  }
});

// ---------------------------------------------------------------
// GESTION DES CLICS SUR LES BOUTONS (OUI / NON)
// ---------------------------------------------------------------
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;
  const messageId = query.message.message_id;

  // On efface les boutons une fois cliqués pour ne pas qu'il appuie 10 fois
  bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });

  if (action === 'joined_yes') {
    bot.sendMessage(
      chatId,
      "Génial ! Bien joué d'avoir franchi le cap, tu es au bon endroit. 🚀\n\nSi tu as la moindre question par la suite, n'hésite pas à envoyer un message au support ici : @leodassupport.\n\nÀ très vite !",
      { parse_mode: 'HTML' }
    );
  } else if (action === 'joined_no') {
    bot.sendMessage(
      chatId,
      "Pas de souci ! Si tu rencontres le moindre problème technique ou si tu as des questions avant de te lancer, l'équipe est là pour t'aider. 🤝\n\nEnvoie un petit message directement au support ici : @leodassupport, on te répondra rapidement !",
      { parse_mode: 'HTML' }
    );
  }

  // Notifier Telegram que le clic a été géré (pour arrêter la petite icône de chargement sur le bouton)
  bot.answerCallbackQuery(query.id);
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
console.log('🤖 Bot 100% opérationnel (Avec boutons de relance à 30min) !');
console.log('📱 Prêt à recevoir des messages...');
