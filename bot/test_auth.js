require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
console.log('Проверка токена бота...');

const bot = new TelegramBot(token, { polling: false });

bot.getMe()
  .then((botInfo) => {
    console.log('--- АВТОРИЗАЦИЯ УСПЕШНА ---');
    console.log('ID бота   :', botInfo.id);
    console.log('Имя бота  :', botInfo.first_name);
    console.log('Username  : @' + botInfo.username);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Ошибка авторизации:', err.message);
    process.exit(1);
  });
