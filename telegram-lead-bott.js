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
const TELEGRAM_TOKEN    = process.env.TELEGRAM_TOKEN || '8766071458:AAHQ_P5uQ_dyusYsRnkEoKPsWCB6mEK8KY4';
const WEBHOOK_URL       = process.env.WEBHOOK_URL || 'https://hook.eu2.make.com/ox7k377smi1srcw731gkij7vehoxr3h5';
const WEBHOOK_BROADCAST = 'https://hook.eu2.make.com/6fyfyefu5ujir2s34996f3kc1izlz8hr'; 
const WEBHOOK_RADAR     = 'https://hook.eu2.make.com/TON_NOUVEAU_LIEN_MAKE_POUR_LE_RADAR'; // 👈 NOUVEAU LIEN MAKE À CRÉER
const CANAL_LINK        = 'https://t.me/+E8-N241k708zZGFk';

// Liste des Admins (Matei, Léo, Yans) pour les notifications
const ADMIN_IDS         = ['7799034591', '1060253366', '1852845904']; 
const ID_LEO            = '1060253366'; // Utilisé pour autoriser la commande /broadcast
// ============================================================

const TelegramBot = require('node-telegram-bot-api');
const axios       = require('axios');

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// ---------------------------------------------------------------
// MENU PERMANENT (COMMANDES)
// ---------------------------------------------------------------
bot.setMyCommands([
  { command: '/canal', description: '📈 Rejoindre le canal privé' },
  { command: '/support', description: '👨‍💻 Contacter l\'équipe support' }
]);

bot.onText(/\/canal/, (msg) => {
  bot.sendMessage(msg.chat.id, `📈 Voici ton accès direct au canal VIP :\n👉 ${CANAL_LINK}`);
});

bot.onText(/\/support/, (msg) => {
  bot.sendMessage(msg.chat.id, `👨‍💻 Besoin d'aide ? Envoie un message directement à notre équipe support ici :\n👉 @leodassupport`);
});

// User sessions storage
const sessions = {};
const webhookCooldown = {};

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Axios config
const axiosConfig = {
  headers: { 'Content-Type': 'application/json' },
  timeout: 10000,
};

// ---------------------------------------------------------------
// COMMANDE /start (AVEC ENVOI DE LA DATE ET DE LA SOURCE À MAKE)
// ---------------------------------------------------------------
bot.onText(/\/start(?: (.+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // On récupère la source dans le lien (ex: ?start=tiktok)
  const sourceTraffic = match[1] ? match[1].toLowerCase() : 'organique';

  // Initialize session
  sessions[chatId] = { step: 'await_firstname', source: sourceTraffic };
  
  bot.sendMessage(
    chatId, 
    '👋 Bienvenue !\n\nComment tu t\'appelles ? Envoie-moi ton <b>prénom</b> 👇', 
    { parse_mode: 'HTML' }
  );
  
  // Webhook START : On envoie tout de suite l'ID et la date à Make pour l'enregistrer dans Sheets
  const payloadStart = {
    action      : "enregistrement_initial",
    telegram_id : userId,
    first_name  : msg.from.first_name || "Curieux",
    last_name   : msg.from.last_name || "", 
    username    : msg.from.username ? `@${msg.from.username}` : "Pas de pseudo", 
    email       : "aucun",
    source      : sourceTraffic,
    date_contact: new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
    text        : "start" 
  };
  
  axios.post(WEBHOOK_URL, payloadStart, axiosConfig)
    .then(() => console.log(`📡 Webhook START envoyé (Source: ${sourceTraffic})`))
    .catch((err) => console.error(`❌ Erreur webhook START: ${err.message}`));

  // ⏱️ RELANCE 15 MIN (Prénom)
  setTimeout(() => {
    if (sessions[chatId] && sessions[chatId].step === 'await_firstname' && !sessions[chatId].relance_prenom_faite) {
      sessions[chatId].relance_prenom_faite = true; 
      bot.sendMessage(
        chatId, 
        '👀 Coucou ! Je vois que tu t\'es arrêté(e) en chemin.\n\nQuel est ton <b>prénom</b> pour continuer ? 👇', 
        { parse_mode: 'HTML' }
      ).catch(() => console.log(`🛑 Relance annulée (Bot bloqué).`));
    }
  }, 15 * 60 * 1000);
});

// ---------------------------------------------------------------
// 📢 LA COMMANDE /broadcast (LE MÉGAPHONE VIA MAKE.COM)
// ---------------------------------------------------------------
bot.onText(/\/broadcast (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id.toString(); 
  const messageAEnvoyer = match[1]; 

  if (userId !== ID_LEO) {
    return bot.sendMessage(chatId, "⛔ Erreur : Vous n'avez pas les droits d'administrateur.");
  }

  bot.sendMessage(chatId, `🚀 <b>Ordre de Broadcast envoyé !</b>\nMake.com va envoyer ce message à toute ta base :\n\n<i>"${messageAEnvoyer}"</i>`, { parse_mode: 'HTML' });

  const payloadBroadcast = {
    action: "launch_broadcast",
    message: messageAEnvoyer
  };

  axios.post(WEBHOOK_BROADCAST, payloadBroadcast, axiosConfig)
    .then(() => console.log(`✅ Ordre de Mégaphone envoyé à Make !`))
    .catch((err) => console.error(`❌ Erreur webhook Mégaphone: ${err.message}`));
});

// ---------------------------------------------------------------
// GESTION DES MESSAGES TEXTES (PRÉNOM & EMAIL)
// ---------------------------------------------------------------
bot.on('message', (msg) => {
  const chatId  = msg.chat.id;
  const userId  = msg.from.id; 
  const text    = msg.text ? msg.text.trim() : '';
  const session = sessions[chatId];
  
  if (!session || text.startsWith('/')) return;
  
  // ═══════════════════════════════════════════════════════════
  // ÉTAPE 1 : PRÉNOM REÇU -> DEMANDE NIVEAU DE TRADING
  // ═══════════════════════════════════════════════════════════
  if (session.step === 'await_firstname') {
    if (!text || text.length < 2) return bot.sendMessage(chatId, '⚠️ Prénom trop court. Essaie à nouveau 👇');
    
    session.first_name = text;
    session.step = 'await_trading_level'; 
    
    // NOTIF 3 ADMINS (Nouveau prospect)
    const pseudo = msg.from.username ? ` (@${msg.from.username})` : "";
    const mentionAdmins = `✅ <b>Nouveau prospect :</b> <a href="tg://user?id=${userId}">${session.first_name}</a>${pseudo} vient de lancer le bot !`;
    
    ADMIN_IDS.forEach(adminId => {
      bot.sendMessage(adminId, mentionAdmins, { parse_mode: 'HTML' }).catch(() => {});
    });
    
    // Envoi des boutons de niveau
    const optionsTrading = {
      parse_mode: 'HTML',
      reply_markup: JSON.stringify({
        inline_keyboard: [
          [{ text: '🟢 Débutant', callback_data: 'lvl_debutant' }],
          [{ text: '🟡 Intermédiaire', callback_data: 'lvl_intermediaire' }],
          [{ text: '🔴 Expert', callback_data: 'lvl_expert' }]
        ]
      })
    };

    bot.sendMessage(
      chatId, 
      `Super, <b>${session.first_name}</b> ! 🙌\n\nAvant d'aller plus loin, quel est ton niveau actuel en trading ?`, 
      optionsTrading
    );

    // ⏱️ RELANCE 15 MIN (Niveau trading manquant)
    setTimeout(() => {
      if (sessions[chatId] && sessions[chatId].step === 'await_trading_level' && !sessions[chatId].relance_niveau_faite) {
        sessions[chatId].relance_niveau_faite = true;
        bot.sendMessage(
          chatId, 
          `⏳ Tu es toujours là <b>${session.first_name}</b> ?\n\nClique sur l'un des boutons au-dessus pour m'indiquer ton niveau en trading ! 👆`, 
          { parse_mode: 'HTML' }
        ).catch(() => {});
      }
    }, 15 * 60 * 1000);

    return; 
  }
  
  // ═══════════════════════════════════════════════════════════
  // ÉTAPE 3 : EMAIL REÇU -> FIN DU TUNNEL
  // ═══════════════════════════════════════════════════════════
  if (session.step === 'await_email') {
    if (!EMAIL_REGEX.test(text)) {
      return bot.sendMessage(chatId, '⚠️ Ce format d\'email ne semble pas valide.\n\nExemple : <code>prenom@domaine.com</code>\n\nRéessaie 👇', { parse_mode: 'HTML' });
    }
    
    session.email = text;
    const firstNameBackup = session.first_name; 
    
    bot.sendMessage(
      chatId, 
      `🎉 Bienvenue <b>${session.first_name}</b> !\n\nTon accès au canal privé est prêt :\n👉 ${CANAL_LINK}`, 
      { parse_mode: 'HTML' }
    );
    
    // NOTIF 3 ADMINS (Email reçu)
    const emailNotif = `📧 <b>Email reçu :</b> ${session.first_name} (Niveau: ${session.trading_level}) a laissé son mail : <code>${session.email}</code>`;
    
    ADMIN_IDS.forEach(adminId => {
      bot.sendMessage(adminId, emailNotif, { parse_mode: 'HTML' }).catch(() => {});
    });
    
    const now = Date.now();
    const lastSent = webhookCooldown[userId] || 0;
    
    if (now - lastSent > 30 * 1000) {
      webhookCooldown[userId] = now;
      const payload = {
        action      : "email_recu", // Ajout de l'action pour faciliter le tri sur Make
        telegram_id : userId,
        first_name  : session.first_name, 
        last_name   : msg.from.last_name || "", 
        username    : msg.from.username ? `@${msg.from.username}` : "Pas de pseudo",
        email       : session.email,
        trading_lvl : session.trading_level, 
        source      : session.source, // On rappelle la source
        text        : "email_received" 
      };
      axios.post(WEBHOOK_URL, payload, axiosConfig).catch(() => {});
    }
    
    delete sessions[chatId];

    // ⏱️ RELANCE 30 MIN (A rejoint le groupe ?)
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
      ).catch(() => {});
    }, 30 * 60 * 1000); 

    // ⏱️ CADEAU 24H (Le PDF de SMC + LA PHOTO VIA ZUPIMAGES)
    setTimeout(() => {
      const texteCadeau = `<b>PDF beaucoup plus poussé ( SMC )</b>\nDisponible gratuitement en m'envoyant "PDF" sur @leodassupport`;

      bot.sendPhoto(
        chatId, 
        'https://zupimages.net/up/26/14/o1mt.jpg', 
        { 
          caption: texteCadeau, 
          parse_mode: 'HTML' 
        }
      ).catch((err) => console.log(`🛑 Erreur envoi photo 24h : ${err.message}`));
      
    }, 24* 60 * 60 * 1000); // 24 heures (en millisecondes)
  }
});

// ---------------------------------------------------------------
// GESTION DES CLICS SUR LES BOUTONS (TRADING + GROUPE)
// ---------------------------------------------------------------
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const action = query.data;
  const messageId = query.message.message_id;

  // Efface les boutons cliqués
  bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId }).catch(() => {});

  // ════════ BOUTONS NIVEAU DE TRADING ════════
  if (action.startsWith('lvl_')) {
    if (!sessions[chatId] || sessions[chatId].step !== 'await_trading_level') return bot.answerCallbackQuery(query.id);

    // On enregistre le niveau
    sessions[chatId].trading_level = action.replace('lvl_', '');
    sessions[chatId].step = 'await_email';

    bot.sendMessage(
      chatId,
      `C'est noté ! 🎯\n\nMaintenant, quelle est ton adresse <b>email</b> pour t'envoyer l'accès ? 👇`,
      { parse_mode: 'HTML' }
    );

    // ⏱️ RELANCE 15 MIN (Email manquant)
    setTimeout(() => {
      if (sessions[chatId] && sessions[chatId].step === 'await_email' && !sessions[chatId].relance_email_faite) {
        sessions[chatId].relance_email_faite = true;
        bot.sendMessage(
          chatId, 
          `⏳ On y est presque, <b>${sessions[chatId].first_name}</b> !\n\nIl ne manque plus que ton <b>email</b> pour te donner l'accès au canal privé. 👇`, 
          { parse_mode: 'HTML' }
        ).catch(() => {});
      }
    }, 15 * 60 * 1000);
  }

  // ════════ BOUTONS "A REJOINT LE GROUPE ?" ════════
  else if (action === 'joined_yes') {
    bot.sendMessage(chatId, "Génial ! Bien joué d'avoir franchi le cap. 🚀\n\nEn cas de question : @leodassupport.", { parse_mode: 'HTML' });
  } else if (action === 'joined_no') {
    bot.sendMessage(chatId, "Pas de souci ! Si tu as des questions ou un bug technique, contacte l'équipe : @leodassupport. 🤝", { parse_mode: 'HTML' });
  }

  bot.answerCallbackQuery(query.id);
});

// ---------------------------------------------------------------
// 🚨 LE RADAR D'ENTRÉE DANS LE GROUPE (DÉLÉGUÉ À MAKE)
// ---------------------------------------------------------------
bot.on('chat_member', (chatMemberUpdate) => {
  const newStatus = chatMemberUpdate.new_chat_member.status;
  const oldStatus = chatMemberUpdate.old_chat_member.status;
  const joinedUser = chatMemberUpdate.new_chat_member.user;
  const groupName = chatMemberUpdate.chat.title || "Groupe Privé";

  // Si c'est une VRAIE nouvelle entrée dans le groupe
  if ((oldStatus === 'left' || oldStatus === 'kicked') && (newStatus === 'member' || newStatus === 'administrator')) {
    
    // On dit à Make de lancer son enquête
    const payloadJoin = {
      action: "recherche_radar",
      telegram_id: joinedUser.id,
      prenom: joinedUser.first_name,
      nom_groupe: groupName
    };

    axios.post(WEBHOOK_RADAR, payloadJoin, axiosConfig)
      .then(() => console.log(`🔍 Alerte Radar envoyée à Make pour l'ID ${joinedUser.id} dans ${groupName}`))
      .catch((err) => console.log(`🛑 Erreur Webhook Radar : ${err.message}`));
  }
});

// ---------------------------------------------------------------
// ERREURS & DÉMARRAGE
// ---------------------------------------------------------------
bot.on('polling_error', (err) => console.error(`❌ Polling error: ${err.message}`));
console.log('🤖 Bot 100% opérationnel (Cloud-Native + Radar Make) !');
