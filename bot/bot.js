/**
 * Kladovshik Telegram Activation Bot
 * Каркас бота для генерации лицензионных ключей приложения «Кладовщик»
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const TelegramBot = require('node-telegram-bot-api');
const { generateLicenseKey, formatDate, LICENSE_SALT } = require('./keygen');

// Файл для постоянного структурированного логирования
const logFile = path.resolve(__dirname, 'bot.log');

/**
 * Запись лога в bot/bot.log с таймстемпом [YYYY-MM-DD HH:mm:ss] и дублированием в консоль
 * @param {string} level Уровень (INFO, WARN, ERROR, FATAL, MSG, CALLBACK, etc.)
 * @param {string} message Текст сообщения
 * @param {any} [meta] Дополнительные данные/объект
 */
function logToFile(level, message, meta = null) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `[${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}]`;
  let line = `${timestamp} [${level.toUpperCase()}] ${message}`;
  if (meta !== null && meta !== undefined) {
    try {
      line += ' | ' + (typeof meta === 'object' ? JSON.stringify(meta) : meta);
    } catch (e) {
      line += ' | [Circular / Unserializable]';
    }
  }
  line += '\n';

  try {
    fs.appendFileSync(logFile, line, 'utf8');
  } catch (err) {
    console.error('Ошибка записи в bot.log:', err.message);
  }
  process.stdout.write(line);
}

// Глобальные обработчики для защиты от молчаливого падения процесса
process.on('uncaughtException', (err) => {
  logToFile('FATAL', 'uncaughtException: ' + (err.stack || err.message));
});

process.on('unhandledRejection', (reason) => {
  logToFile('ERROR', 'unhandledRejection: ' + (reason && reason.stack ? reason.stack : reason));
});

const token = process.env.BOT_TOKEN;

if (!token || token.trim() === '' || token === 'ваш_токен_здесь' || token === 'your_telegram_bot_token_here') {
  logToFile('FATAL', 'BOT_TOKEN не задан в bot/.env файле! Бот остановлен.');
  process.exit(0);
}

// Инициализация Telegram бота с polling
const bot = new TelegramBot(token, { polling: true });

// Перехват всех ошибок polling и API Telegram
bot.on('polling_error', (error) => {
  logToFile('POLLING_ERROR', `${error.code || 'UNKNOWN'}: ${error.message}`);
});

bot.on('webhook_error', (error) => {
  logToFile('WEBHOOK_ERROR', error.message);
});

bot.on('error', (error) => {
  logToFile('BOT_ERROR', error.message);
});

// URL Telegram Mini App
const MINI_APP_URL = 'https://sergei123321123.github.io/kladovshik-pay/';

/**
 * Получение URL Mini App с опциональной передачей startapp=<DEVICE_ID>
 * @param {string|null} deviceId Идентификатор устройства
 * @returns {string} Полный URL для открытия Mini App
 */
function getMiniAppUrl(deviceId = null) {
  if (deviceId) {
    const cleanId = parseDeviceId(deviceId) || deviceId;
    return `${MINI_APP_URL}?startapp=${encodeURIComponent(cleanId)}`;
  }
  return MINI_APP_URL;
}

/**
 * Установка постоянной синей кнопки Menu Button слева от поля ввода в Telegram
 * @param {number|string|null} chatId Опциональный ID целевого чата
 */
async function initChatMenuButton(chatId = null) {
  try {
    const form = {
      menu_button: JSON.stringify({
        type: 'web_app',
        text: 'Оплатить PRO',
        web_app: { url: MINI_APP_URL }
      })
    };
    if (chatId) {
      form.chat_id = chatId;
    }
    await bot.setChatMenuButton(form);
    logToFile('INFO', `Chat Menu Button успешно установлен (Web App)${chatId ? ` для ${chatId}` : ' (по умолчанию)'}`);
  } catch (err) {
    logToFile('WARN', `Предупреждение при установке Menu Button: ${err.message}`);
  }
}

// Установка глобальной кнопки меню при запуске
initChatMenuButton().catch(() => {});

/**
 * Генерация постоянной Reply-клавиатуры с нативной кнопкой вызова Web App
 * @param {string|null} deviceId Опциональный Device ID для предзаполнения
 */
function getReplyKeyboard(deviceId = null) {
  const url = getMiniAppUrl(deviceId);
  return {
    reply_markup: {
      keyboard: [
        [
          { text: '🚀 Оплатить PRO (Mini App)', web_app: { url } },
          { text: '📖 Инструкция' }
        ]
      ],
      resize_keyboard: true
    }
  };
}

// Главная клавиатура с кнопками по умолчанию
const MAIN_KEYBOARD = getReplyKeyboard();

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
  const matchSimple = clean.match(/\b([A-F0-9]{6,16}-[A-F0-9]{2,8})\b/i);
  if (matchSimple) {
    return `KLAD-${matchSimple[1].toUpperCase()}`;
  }

  return null;
}

// Приветственное сообщение
function getWelcomeMessage(firstName = 'Пользователь', deviceId = null) {
  let msg = (
    `👋 Здравствуйте, ${firstName}!\n\n` +
    `Я официальный бот активации мобильного приложения *«PriemTovara / Кладовщик»* (Warehouse Intake Counter).\n\n` +
    `Здесь вы можете получить персональный ключ для активации вечной лицензии *PRO Unlimited*:\n` +
    `• Через *Telegram Mini App* (СБП, банковские карты РФ, Stars);\n` +
    `• Прямой оплатой *Telegram Stars* (${PRO_STARS_PRICE} ⭐).\n\n`
  );

  if (deviceId) {
    msg += (
      `📱 *Распознан Device ID:* \`${deviceId}\`\n\n` +
      `Нажмите кнопку ниже для перехода к оплате или оплатите счет Stars прямо в чате:`
    );
  } else {
    msg += `Нажмите *«🚀 Оплатить PRO (Mini App)»* внизу или отправьте ваш Device ID:`;
  }

  return msg;
}

// Текст инструкции
function getInstructionMessage() {
  return (
    `📖 *Инструкция по покупке и активации PRO-версии:*\n\n` +
    `1. Откройте приложение *«PriemTovara / Кладовщик»* на смартфоне или в браузере.\n` +
    `2. Нажмите на бейдж лицензии в верхней панели (*Demo: 0/15*).\n` +
    `3. В открывшемся окне нажмите на блок с вашим *Device ID*, чтобы скопировать его.\n` +
    `4. Нажмите *«🚀 Оплатить PRO (Mini App)»* (или синюю кнопку меню слева от поля ввода сообщения).\n` +
    `5. Выберите удобный способ (СБП / Карта РФ / Telegram Stars).\n` +
    `6. При оплате Stars (${PRO_STARS_PRICE} ⭐) бот выставит счет прямо в чате и моментально сгенерирует ключ PRO.\n` +
    `7. Вставьте ключ в поле ввода в приложении и нажмите *«Активировать»*.\n\n` +
    `✨ Лицензия активируется навсегда для вашего устройства!`
  );
}

// Текст запроса Device ID
function getPromptDeviceMessage() {
  return (
    `📱 *Отправьте ваш Device ID из приложения*\n\n` +
    `Он выглядит следующим образом:\n` +
    `\`KLAD-XXXXXXXX-XXXX\`\n\n` +
    `_Либо нажмите «🚀 Оплатить PRO (Mini App)», чтобы открыть интерфейс оплаты с автоподстановкой ключа._`
  );
}

// Обработка команды /start
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const name = msg.from ? (msg.from.first_name || 'Пользователь') : 'Пользователь';
  const rawParam = match && match[1] ? match[1].trim() : '';
  const deviceId = parseDeviceId(rawParam);

  logToFile('COMMAND_START', `Чат: ${chatId}, Имя: "${name}", Параметр: "${rawParam}", DeviceID: ${deviceId || 'нет'}`);

  // Обновляем Menu Button для пользователя
  initChatMenuButton(chatId).catch(() => {});

  if (deviceId) {
    const inlineKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '⭐ Оплатить 1 Star',
              callback_data: `PAY_STARS:${deviceId}`
            }
          ],
          [
            {
              text: '🚀 Оплатить PRO (Mini App)',
              web_app: { url: getMiniAppUrl(deviceId) }
            }
          ]
        ]
      }
    };

    try {
      await bot.sendMessage(chatId, getWelcomeMessage(name, deviceId), {
        parse_mode: 'Markdown',
        ...inlineKeyboard,
        ...getReplyKeyboard(deviceId)
      });
    } catch (err) {
      logToFile('ERROR', `Ошибка отправки приветствия: ${err.message}`);
    }

    try {
      await sendStarsInvoice(chatId, deviceId);
    } catch (err) {
      logToFile('ERROR', `Ошибка при отправке инвойса Stars из /start: ${err.message}`);
      bot.sendMessage(
        chatId,
        '❌ Не удалось автоматически выставить счет Stars. Нажмите кнопку ниже для повторной попытки:',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '⭐ Оплатить 1 Star', callback_data: `PAY_STARS:${deviceId}` }]
            ]
          }
        }
      );
    }
    return;
  }

  const inlineKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🚀 Оплатить PRO (Mini App)',
            web_app: { url: getMiniAppUrl() }
          }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, getWelcomeMessage(name, null), {
    parse_mode: 'Markdown',
    ...inlineKeyboard,
    ...getReplyKeyboard()
  });
});

// Обработка команды /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  logToFile('COMMAND_HELP', `Чат: ${chatId}`);

  const inlineKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: '🚀 Оплатить PRO (Mini App)',
            web_app: { url: getMiniAppUrl() }
          }
        ]
      ]
    }
  };

  bot.sendMessage(chatId, getInstructionMessage(), {
    parse_mode: 'Markdown',
    ...inlineKeyboard,
    ...getReplyKeyboard()
  });
});

// ============================================================
// ОПЛАТА ТАРИФА PRO ЧЕРЕЗ TELEGRAM STARS (XTR)
// ============================================================

const PRO_STARS_PRICE = 1; // 1 Star (Тестовая символическая оплата)

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

  logToFile('SEND_INVOICE', `Выставление счета Stars на ${PRO_STARS_PRICE} XTR для ${cleanId} в чат ${chatId}`);

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

  logToFile('PAYMENT_SUCCESS', `Чек: ${chargeId}, Сумма: ${payment.total_amount} ${payment.currency}, Payload: ${payload}`);

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
      ...getReplyKeyboard(deviceId)
    });

    logToFile('KEY_GENERATED', `Ключ ${licenseKey} отправлен в чат ${chatId} для устройства ${deviceId}`);
  } else {
    bot.sendMessage(
      chatId,
      `✅ *Оплата Stars получена!* (Чек: \`${chargeId}\`)\n\n` +
      `Пожалуйста, отправьте ваш *Device ID* (формат: \`KLAD-XXXXXXXX-XXXX\`) для генерации персонального ключа.`,
      {
        parse_mode: 'Markdown',
        ...getReplyKeyboard()
      }
    );
    logToFile('WARN', `Оплата получена, но Device ID не распознан в payload: "${payload}"`);
  }
}

// 1. Слушатель pre_checkout_query: подтверждение возможности оплаты
bot.on('pre_checkout_query', async (query) => {
  const payload = query.invoice_payload || '';
  logToFile('PRE_CHECKOUT_QUERY', `ID: ${query.id}, От: ${query.from?.id} (@${query.from?.username || ''}), Сумма: ${query.total_amount} ${query.currency}, Payload: ${payload}`);

  try {
    if (payload.startsWith('PRO_STARS:') && query.total_amount === PRO_STARS_PRICE && query.currency === 'XTR') {
      await bot.answerPreCheckoutQuery(query.id, true);
      logToFile('INFO', `pre_checkout_query ${query.id} успешно подтвержден`);
    } else {
      logToFile('WARN', `pre_checkout_query ${query.id} отклонен: несовпадение суммы или payload`);
      await bot.answerPreCheckoutQuery(query.id, false, {
        error_message: 'Недействительный заказ или изменилась сумма счета.'
      });
    }
  } catch (err) {
    logToFile('ERROR', `Ошибка в обработчике pre_checkout_query: ${err.message}`);
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

// 3. Слушатель инлайн-кнопок callback_query
bot.on('callback_query', async (query) => {
  const chatId = query.message ? query.message.chat.id : null;
  const data = query.data || '';
  const fromUser = query.from ? `${query.from.first_name || ''} (@${query.from.username || 'no_user'}, id:${query.from.id})` : 'Unknown';

  logToFile('CALLBACK_QUERY', `От: ${fromUser}, Чат: ${chatId}, Data: "${data}"`);

  if (!chatId) return;

  if (data.startsWith('PAY_STARS:')) {
    const rawId = data.replace('PAY_STARS:', '');
    const deviceId = parseDeviceId(rawId) || rawId;
    try {
      await bot.answerCallbackQuery(query.id);
      await sendStarsInvoice(chatId, deviceId);
    } catch (err) {
      logToFile('ERROR', `Ошибка при отправке инвойса из callback_query: ${err.message}`);
    }
  } else if (data === 'PROMPT_STARS') {
    try {
      await bot.answerCallbackQuery(query.id);
    } catch (e) {}
    bot.sendMessage(chatId, getPromptDeviceMessage(), {
      parse_mode: 'Markdown',
      ...getReplyKeyboard()
    });
  }
});

// Команда /stars или /buy для выставления счета
bot.onText(/\/(?:stars|buy)(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const rawArg = match && match[1] ? match[1].trim() : '';
  const deviceId = parseDeviceId(rawArg);

  logToFile('COMMAND_STARS', `Чат: ${chatId}, Аргумент: "${rawArg}", DeviceID: ${deviceId || 'нет'}`);

  if (deviceId) {
    const inlineKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '⭐ Оплатить 1 Star',
              callback_data: `PAY_STARS:${deviceId}`
            }
          ],
          [
            {
              text: '🚀 Оплатить PRO (Mini App)',
              web_app: { url: getMiniAppUrl(deviceId) }
            }
          ]
        ]
      }
    };
    try {
      await sendStarsInvoice(chatId, deviceId);
      bot.sendMessage(chatId, `⭐ Счет Stars для \`${deviceId}\` выставлен выше. Нажмите кнопку в инвойсе или «⭐ Оплатить 1 Star»:`, {
        parse_mode: 'Markdown',
        ...inlineKeyboard,
        ...getReplyKeyboard(deviceId)
      });
    } catch (err) {
      logToFile('ERROR', `Ошибка при отправке инвойса Stars: ${err.message}`);
      bot.sendMessage(chatId, '❌ Не удалось выставить счет Telegram Stars. Нажмите кнопку ниже для повтора:', {
        reply_markup: {
          inline_keyboard: [
            [{ text: '⭐ Оплатить 1 Star', callback_data: `PAY_STARS:${deviceId}` }]
          ]
        }
      });
    }
  } else {
    const inlineKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Оплатить PRO (Mini App)',
              web_app: { url: getMiniAppUrl() }
            }
          ]
        ]
      }
    };
    bot.sendMessage(
      chatId,
      `⭐ *Оплата лицензии через Telegram Stars (${PRO_STARS_PRICE} ⭐)*\n\n` +
      `Укажите ваш Device ID после команды для выставления счета:\n` +
      `\`/stars KLAD-XXXXXXXX-XXXX\`\n\n` +
      `_Либо нажмите кнопку ниже для открытия Mini App:_`,
      {
        parse_mode: 'Markdown',
        ...inlineKeyboard,
        ...getReplyKeyboard()
      }
    );
  }
});

// Обработка текстовых сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const fromUser = msg.from ? `${msg.from.first_name || ''} (@${msg.from.username || 'no_user'}, id:${msg.from.id})` : 'Unknown';

  logToFile('MESSAGE', `От: ${fromUser}, Чат: ${chatId}, Текст: "${msg.text || ''}"`, {
    successful_payment: !!msg.successful_payment,
    web_app_data: !!msg.web_app_data
  });

  // Проверка успешной оплаты в потоке сообщений
  if (msg.successful_payment) {
    handleSuccessfulPayment(msg);
    return;
  }

  // Обработка данных от WebApp
  if (msg.web_app_data && msg.web_app_data.data) {
    const rawData = msg.web_app_data.data;
    logToFile('WEB_APP_DATA', `Получен web_app_data от ${fromUser}: "${rawData}"`);
    try {
      const parsed = JSON.parse(rawData);
      const devId = parseDeviceId(parsed.deviceId || parsed.id || rawData);
      if (devId) {
        logToFile('INFO', `Из WebApp извлечен Device ID: ${devId}. Отправка инвойса Stars...`);
        await sendStarsInvoice(chatId, devId);
        return;
      }
    } catch (e) {
      const devId = parseDeviceId(rawData);
      if (devId) {
        logToFile('INFO', `Из WebApp (plain) извлечен Device ID: ${devId}. Отправка инвойса Stars...`);
        await sendStarsInvoice(chatId, devId);
        return;
      }
    }
  }

  if (!msg.text) return;
  const text = msg.text.trim();

  // Игнорируем команды со слешем, они обрабатываются onText
  if (text.startsWith('/')) return;

  // Нажатие кнопки "📖 Инструкция"
  if (text.includes('Инструкция')) {
    const inlineKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Оплатить PRO (Mini App)',
              web_app: { url: getMiniAppUrl() }
            }
          ]
        ]
      }
    };
    bot.sendMessage(chatId, getInstructionMessage(), {
      parse_mode: 'Markdown',
      ...inlineKeyboard,
      ...getReplyKeyboard()
    });
    return;
  }

  // Нажатие кнопки "Активировать" / "Оплатить" (если пришел текст)
  if (text.includes('Активировать') || text.includes('Оплатить')) {
    const inlineKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Оплатить PRO (Mini App)',
              web_app: { url: getMiniAppUrl() }
            }
          ]
        ]
      }
    };
    bot.sendMessage(chatId, getPromptDeviceMessage(), {
      parse_mode: 'Markdown',
      ...inlineKeyboard,
      ...getReplyKeyboard()
    });
    return;
  }

  // Проверяем, является ли сообщение Device ID
  const deviceId = parseDeviceId(text);

  if (deviceId) {
    const inlineKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '⭐ Оплатить 1 Star',
              callback_data: `PAY_STARS:${deviceId}`
            }
          ],
          [
            {
              text: '🚀 Оплатить PRO (Mini App)',
              web_app: { url: getMiniAppUrl(deviceId) }
            }
          ]
        ]
      }
    };

    try {
      await bot.sendMessage(
        chatId,
        `📱 *Device ID принят:* \`${deviceId}\`\n\n` +
        `Счет на оплату 1 ⭐ выставлен ниже. Нажмите «Оплатить» в счете или кнопку «⭐ Оплатить 1 Star»:`,
        {
          parse_mode: 'Markdown',
          ...inlineKeyboard,
          ...getReplyKeyboard(deviceId)
        }
      );
    } catch (err) {
      logToFile('ERROR', `Ошибка отправки сообщения Device ID: ${err.message}`);
    }

    try {
      await sendStarsInvoice(chatId, deviceId);
    } catch (err) {
      logToFile('ERROR', `Ошибка при отправке инвойса Stars на Device ID: ${err.message}`);
      bot.sendMessage(
        chatId,
        '❌ Не удалось автоматически выставить счет Telegram Stars. Нажмите кнопку ниже для повторной попытки:',
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '⭐ Оплатить 1 Star', callback_data: `PAY_STARS:${deviceId}` }]
            ]
          }
        }
      );
    }
  } else {
    // Пользователь прислал непонятный текст
    const inlineKeyboard = {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🚀 Оплатить PRO (Mini App)',
              web_app: { url: getMiniAppUrl() }
            }
          ]
        ]
      }
    };
    bot.sendMessage(
      chatId,
      `❓ Не удалось распознать Device ID.\n\n` +
      `Пожалуйста, скопируйте его из приложения (формат: \`KLAD-XXXXXXXX-XXXX\`) или откройте Mini App:`,
      {
        parse_mode: 'Markdown',
        ...inlineKeyboard,
        ...getReplyKeyboard()
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
  MAIN_KEYBOARD,
  MINI_APP_URL,
  getMiniAppUrl,
  initChatMenuButton,
  getReplyKeyboard,
  logToFile
};

// Первичная запись в лог при запуске
logToFile('STARTUP', '🤖 Telegram-бот «Кладовщик» запущен и ожидает событий...');

