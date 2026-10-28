/**
 * Kladovshik Telegram Activation Bot
 * Каркас бота для генерации лицензионных ключей приложения «Кладовщик»
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const TelegramBot = require('node-telegram-bot-api');
const { generateLicenseKey, formatDate, LICENSE_SALT } = require('./keygen');

const token = process.env.BOT_TOKEN;

if (!token || token.trim() === '' || token === 'ваш_токен_здесь' || token === 'your_telegram_bot_token_here') {
  console.log('===============================================================');
  console.log('⚠️  ВНИМАНИЕ: BOT_TOKEN не задан в bot/.env файле!');
  console.log('1. Создайте файл bot/.env (скопируйте bot/.env.example)');
  console.log('2. Укажите действительный токен от @BotFather: BOT_TOKEN=123456:ABC-DEF...');
  console.log('3. Запустите бота командой: npm start');
  console.log('===============================================================');
  process.exit(0);
}

// Инициализация Telegram бота с polling
const bot = new TelegramBot(token, { polling: true });

// Главная клавиатура с кнопками
const MAIN_KEYBOARD = {
  reply_markup: {
    keyboard: [
      [{ text: '🔑 Активировать приложение' }, { text: '📖 Инструкция' }]
    ],
    resize_keyboard: true
  }
};

// Функция проверки строки на Device ID
function parseDeviceId(text) {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim().toUpperCase();
  
  // Регулярное выражение для поиска формата KLAD-XXXXXXXX-XXXX
  const match = clean.match(/KLAD-[A-F0-9]{4,16}-[A-F0-9]{2,8}/i);
  if (match) {
    return match[0].toUpperCase();
  }
  
  // Допускаем также ввод без префикса KLAD-, если переданы 2 hex-блока
  const matchSimple = clean.match(/^([A-F0-9]{6,16}-[A-F0-9]{2,8})$/i);
  if (matchSimple) {
    return `KLAD-${matchSimple[1].toUpperCase()}`;
  }

  return null;
}

// Приветственное сообщение
function getWelcomeMessage(firstName = 'Пользователь') {
  return (
    `👋 Здравствуйте, ${firstName}!\n\n` +
    `Я официальный бот активации мобильного приложения *«Кладовщик»* (Warehouse Intake Counter).\n\n` +
    `Здесь вы можете получить персональный ключ для активации вечной лицензии *PRO Unlimited*.\n\n` +
    `Выберите действие в меню ниже:`
  );
}

// Текст инструкции
function getInstructionMessage() {
  return (
    `📖 *Инструкция по активации PRO-версии:*\n\n` +
    `1. Откройте приложение *«Кладовщик»* на смартфоне или в браузере.\n` +
    `2. Нажмите на бейдж лицензии в верхней панели (например, *Demo: 0/15*).\n` +
    `3. В открывшемся окне нажмите на блок с вашим *Device ID*, чтобы скопировать его.\n` +
    `4. Вернитесь в этот бот, нажмите кнопку *«🔑 Активировать приложение»* и отправьте скопированный ID.\n` +
    `5. Бот пришлет вам ключ активации.\n` +
    `6. Вставьте ключ в поле ввода в приложении и нажмите *«Активировать PRO»*.\n\n` +
    `✨ Лицензия активируется навсегда для вашего устройства!`
  );
}

// Текст запроса Device ID
function getPromptDeviceMessage() {
  return (
    `📱 *Отправьте ваш Device ID из приложения*\n\n` +
    `Он выглядит следующим образом:\n` +
    `\`KLAD-XXXXXXXX-XXXX\`\n\n` +
    `_Просто скопируйте его из окна активации приложения и пришлите ответным сообщением в этот чат._`
  );
}

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from ? (msg.from.first_name || 'Пользователь') : 'Пользователь';
  bot.sendMessage(chatId, getWelcomeMessage(name), {
    parse_mode: 'Markdown',
    ...MAIN_KEYBOARD
  });
});

// Обработка команды /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, getInstructionMessage(), {
    parse_mode: 'Markdown',
    ...MAIN_KEYBOARD
  });
});

// ============================================================
// ОПЛАТА ТАРИФА PRO ЧЕРЕЗ TELEGRAM STARS (XTR)
// ============================================================

const PRO_STARS_PRICE = 250; // 250 Stars (~5 $)

/**
 * Отправка инвойса Telegram Stars по запросу пользователя с Device ID
 * @param {number|string} chatId ID чата в Telegram
 * @param {string} deviceId Идентификатор устройства KLAD-XXXXXXXX-XXXX
 */
function sendStarsInvoice(chatId, deviceId) {
  const cleanId = parseDeviceId(deviceId) || deviceId;
  const title = 'Лицензия PRO Навсегда';
  const description = `Бессрочный доступ к «Кладовщик PRO» для устройства ${cleanId}`;
  const payload = `PRO_STARS:${cleanId}:${chatId}`;
  const providerToken = ''; // Для Telegram Stars строго пустая строка!
  const currency = 'XTR';
  const prices = [{ label: 'Кладовщик PRO (Бессрочно)', amount: PRO_STARS_PRICE }];

  return bot.sendInvoice(
    chatId,
    title,
    description,
    payload,
    providerToken,
    currency,
    prices,
    {
      need_name: false,
      need_phone_number: false,
      need_email: false,
      need_shipping_address: false
    }
  );
}

/**
 * Обработка успешного платежа и выдача лицензионного ключа PRO
 * @param {Object} msg Объект входящего сообщения Telegram с successful_payment
 */
function handleSuccessfulPayment(msg) {
  const payment = msg.successful_payment;
  if (!payment) return;

  const chatId = msg.chat.id;
  const payload = payment.invoice_payload || '';
  const chargeId = payment.telegram_payment_charge_id;

  console.log(`⭐ [STARS PAYMENT] Чек: ${chargeId}, Сумма: ${payment.total_amount} ${payment.currency}`);

  // Извлекаем Device ID из payload: "PRO_STARS:KLAD-XXXXXXXX-XXXX:chatId"
  const parts = payload.split(':');
  const rawId = parts[1] || '';
  const deviceId = parseDeviceId(rawId) || rawId;

  if (deviceId) {
    const now = Date.now();
    const licenseKey = generateLicenseKey(deviceId, now);
    const expiryDate = formatDate(now + 72 * 3600 * 1000);

    const successMsg = (
      `⭐ *Оплата Stars получена успешно!*\n\n` +
      `Чек транзакции: \`${chargeId}\`\n\n` +
      `🎉 *Ваш ключ лицензии PRO готов:*\n` +
      `\`${licenseKey}\`\n\n` +
      `📱 *Привязка к устройству:* \`${deviceId}\`\n` +
      `⏳ *Срок действия:* 3 дня на активацию (до ${expiryDate}).\n\n` +
      `Скопируйте ключ и вставьте в окне активации приложения!\n` +
      `После активации бессрочный доступ закрепляется за вашим устройством.`
    );

    bot.sendMessage(chatId, successMsg, {
      parse_mode: 'Markdown',
      ...MAIN_KEYBOARD
    });
  } else {
    bot.sendMessage(
      chatId,
      `✅ *Оплата Stars получена!* (Чек: \`${chargeId}\`)\n\n` +
      `Пожалуйста, отправьте ваш *Device ID* (формат: \`KLAD-XXXXXXXX-XXXX\`) для генерации персонального ключа.`,
      {
        parse_mode: 'Markdown',
        ...MAIN_KEYBOARD
      }
    );
  }
}

// 1. Слушатель pre_checkout_query: подтверждение возможности оплаты
bot.on('pre_checkout_query', async (query) => {
  try {
    const payload = query.invoice_payload || '';
    if (payload.startsWith('PRO_STARS:') && query.total_amount === PRO_STARS_PRICE && query.currency === 'XTR') {
      await bot.answerPreCheckoutQuery(query.id, true);
    } else {
      await bot.answerPreCheckoutQuery(query.id, false, {
        error_message: 'Недействительный заказ или изменилась сумма счета.'
      });
    }
  } catch (err) {
    console.error('Ошибка в обработчике pre_checkout_query:', err);
    try {
      await bot.answerPreCheckoutQuery(query.id, false, {
        error_message: 'Произошла ошибка при обработке платежа. Попробуйте еще раз.'
      });
    } catch (e) {}
  }
});

// 2. Слушатель successful_payment
bot.on('successful_payment', (msg) => {
  handleSuccessfulPayment(msg);
});

// Команда /stars или /buy для выставления счета
bot.onText(/\/(?:stars|buy)(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const rawArg = match && match[1] ? match[1].trim() : '';
  const deviceId = parseDeviceId(rawArg);

  if (deviceId) {
    try {
      await sendStarsInvoice(chatId, deviceId);
    } catch (err) {
      console.error('Ошибка при отправке инвойса Stars:', err);
      bot.sendMessage(chatId, '❌ Не удалось выставить счет Telegram Stars. Попробуйте еще раз чуть позже.');
    }
  } else {
    bot.sendMessage(
      chatId,
      `⭐ *Оплата лицензии через Telegram Stars (${PRO_STARS_PRICE} ⭐)*\n\n` +
      `Укажите ваш Device ID после команды для выставления счета:\n` +
      `\`/stars KLAD-XXXXXXXX-XXXX\`\n\n` +
      `_Device ID можно скопировать из окна активации приложения Кладовщик._`,
      {
        parse_mode: 'Markdown',
        ...MAIN_KEYBOARD
      }
    );
  }
});

// Обработка текстовых сообщений
bot.on('message', (msg) => {
  // Проверка успешной оплаты в потоке сообщений
  if (msg.successful_payment) {
    handleSuccessfulPayment(msg);
    return;
  }

  if (!msg.text) return;
  const text = msg.text.trim();
  const chatId = msg.chat.id;

  // Игнорируем команды со слешем, они обрабатываются onText
  if (text.startsWith('/')) return;

  // Нажатие кнопки "📖 Инструкция"
  if (text.includes('Инструкция')) {
    bot.sendMessage(chatId, getInstructionMessage(), {
      parse_mode: 'Markdown',
      ...MAIN_KEYBOARD
    });
    return;
  }

  // Нажатие кнопки "🔑 Активировать приложение"
  if (text.includes('Активировать приложение')) {
    bot.sendMessage(chatId, getPromptDeviceMessage(), {
      parse_mode: 'Markdown',
      ...MAIN_KEYBOARD
    });
    return;
  }

  // Проверяем, является ли сообщение Device ID
  const deviceId = parseDeviceId(text);

  if (deviceId) {
    const now = Date.now();
    const licenseKey = generateLicenseKey(deviceId, now);
    const expiryDate = formatDate(now + 72 * 3600 * 1000);

    const reply = (
      `🎉 *Ваш ключ лицензии PRO готов!*\n\n` +
      `\`${licenseKey}\`\n\n` +
      `📋 _(Нажмите на ключ выше, чтобы скопировать его)_\n\n` +
      `📱 *Привязка к устройству:* \`${deviceId}\`\n` +
      `⏳ *Срок действия:* ключ действует 3 дня на активацию (до ${expiryDate}). Скопируйте и вставьте в приложении.\n\n` +
      `⭐ *После активации:* лицензия PRO Unlimited закрепляется за вами навсегда!\n\n` +
      `💡 _Также доступна оплата через Telegram Stars (250 ⭐): команда \`/stars ${deviceId}\`_`
    );

    bot.sendMessage(chatId, reply, {
      parse_mode: 'Markdown',
      ...MAIN_KEYBOARD
    });
  } else {
    // Пользователь прислал непонятный текст
    bot.sendMessage(
      chatId,
      `❓ Не удалось распознать Device ID.\n\n` +
      `Пожалуйста, скопируйте его из приложения (формат: \`KLAD-XXXXXXXX-XXXX\`) или нажмите *«📖 Инструкция»*.`,
      {
        parse_mode: 'Markdown',
        ...MAIN_KEYBOARD
      }
    );
  }
});

// Экспорт для тестирования и внешнего вызова
module.exports = {
  bot,
  sendStarsInvoice,
  handleSuccessfulPayment,
  parseDeviceId,
  PRO_STARS_PRICE,
  MAIN_KEYBOARD
};

// Логирование запуска
console.log('🤖 Telegram-бот «Кладовщик» запущен и ожидает сообщений...');
