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
const WEBHOOK_URL      = process.env.WEBHOOK_URL || 'https://hook.eu2.make.com/btea21xtaoh1oh57foos4v2wiuy1tx3n';
const CANAL_LINK       = 'https://t.me/+BopVBNbdBVQzYjQ0';
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
// /start COMMAND
// ---------------------------------------------------------------
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  
  // Initialize session
  sessions[chatId] = { step: 'await_firstname' };
  
  // Welcome message
  bot.sendMessage(
    chatId, 
    '👋 Welcome!\n\nWhat\'s your name? Send me your <b>first name</b> 👇', 
    { parse_mode: 'HTML' }
  );
  
  // Webhook START
  const payloadStart = {
    telegram_id : userId,
    first_name  : msg.from.first_name || "Curious",
    last_name   : msg.from.last_name || "", 
    username    : msg.from.username ? `@${msg.from.username}` : "No username", 
    email       : "none",
    text        : "/start" 
  };
  
  axios.post(WEBHOOK_URL, payloadStart, axiosConfig)
    .then(() => console.log(`📡 Webhook START sent for User ${userId}`))
    .catch((err) => console.error(`❌ Webhook START error: ${err.message}`));
});

// ---------------------------------------------------------------
// MESSAGE HANDLING
// ---------------------------------------------------------------
bot.on('message', (msg) => {
  const chatId  = msg.chat.id;
  const userId  = msg.from.id; 
  const text    = msg.text ? msg.text.trim() : '';
  const session = sessions[chatId];
  
  // Ignore if no session or if it's a command
  if (!session || text.startsWith('/')) return;
  
  // ═══════════════════════════════════════════════════════════
  // STEP 1 : FIRST NAME
  // ═══════════════════════════════════════════════════════════
  if (session.step === 'await_firstname') {
    
    if (!text || text.length < 2) {
      return bot.sendMessage(chatId, '⚠️ Name too short. Please try again 👇');
    }
    
    session.first_name = text;
    session.step = 'await_email';
    
    // LEO NOTIFICATION
    const pseudo = msg.from.username ? ` (@${msg.from.username})` : "";
    const mentionLeo = `✅ <b>New lead:</b> <a href="tg://user?id=${userId}">${session.first_name}</a>${pseudo} just started the bot!`;
    
    bot.sendMessage(ID_LEO, mentionLeo, { parse_mode: 'HTML' })
      .then(() => console.log(`📲 Leo notif sent for ${session.first_name}`))
      .catch((err) => console.error(`❌ Leo notif error (Start): ${err.message}`));
    
    return bot.sendMessage(
      chatId, 
      `Great, <b>${session.first_name}</b>! 🙌\n\nNow, what is your <b>email address</b>?`, 
      { parse_mode: 'HTML' }
    );
  }
  
  // ═══════════════════════════════════════════════════════════
  // STEP 2 : EMAIL
  // ═══════════════════════════════════════════════════════════
  if (session.step === 'await_email') {
    
    if (!EMAIL_REGEX.test(text)) {
      return bot.sendMessage(
        chatId, 
        '⚠️ This email format doesn\'t look valid.\n\nExample: <code>name@domain.com</code>\n\nTry again 👇',
        { parse_mode: 'HTML' }
      );
    }
    
    session.email = text;
    
    // Confirmation message & link
    bot.sendMessage(
      chatId, 
      `🎉 Welcome <b>${session.first_name}</b>!\n\nYour access to the private channel is ready:\n👉 ${CANAL_LINK}`, 
      { parse_mode: 'HTML' }
    );
    
    // LEO NOTIFICATION (Email received)
    const emailNotif = `📧 <b>Email received:</b> ${session.first_name} left their email: <code>${session.email}</code>`;
    
    bot.sendMessage(ID_LEO, emailNotif, { parse_mode: 'HTML' })
      .then(() => console.log(`📧 Email notif sent to Leo for ${session.first_name}`))
      .catch((err) => console.error(`❌ Leo notif error (Email): ${err.message}`));
    
    // Webhook LEAD avec cooldown 30 secondes
    const now = Date.now();
    const lastSent = webhookCooldown[userId] || 0;
    
    if (now - lastSent > 30 * 1000) {
      webhookCooldown[userId] = now;
      
      const payload = {
        telegram_id : userId,
        first_name  : session.first_name, 
        last_name   : msg.from.last_name || "", 
        username    : msg.from.username ? `@${msg.from.username}` : "No username",
        email       : session.email,
        text        : "email_received"
      };
      
      axios.post(WEBHOOK_URL, payload, axiosConfig)
        .then(() => console.log(`✅ Lead sent → ${payload.email}`))
        .catch((err) => console.error(`❌ Webhook LEAD error: ${err.message}`));
    } else {
      console.log(`⏱️ Cooldown actif pour User ${userId} - webhook ignoré`);
    }
    
    // Clear session
    delete sessions[chatId];
  }
});

// ---------------------------------------------------------------
// ERROR HANDLING
// ---------------------------------------------------------------
bot.on('polling_error', (err) => {
  console.error(`❌ Polling error: ${err.message}`);
});

// ---------------------------------------------------------------
// STARTUP
// ---------------------------------------------------------------
console.log('🤖 Bot 100% operational in FULL ENGLISH!');
console.log('📱 Ready to receive messages...');

