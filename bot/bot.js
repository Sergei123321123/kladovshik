/**
 * Kladovshik Telegram Activation Bot
 * 100% Native Chat Billing (Telegram Stars & ЮKassa СБП)
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

// Конфигурация тарифов и эквайринга
const YOOKASSA_SHOP_ID = process.env.YOOKASSA_SHOP_ID || '';
const YOOKASSA_SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || '';
const YOOKASSA_TEST_MODE = process.env.YOOKASSA_TEST_MODE !== 'false';
const PRICE_RUB = parseInt(process.env.PRICE_RUB || '400', 10);
const PRO_STARS_PRICE = 1; // 1 Star (Тестовая символическая оплата)

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

/**
 * Сброс кнопки меню чата на стандартную
 * @param {number|string|null} chatId Опциональный ID целевого чата
 */
async function resetChatMenuButton(chatId = null) {
  try {
    const form = {
      menu_button: JSON.stringify({ type: 'default' })
    };
    if (chatId) {
      form.chat_id = chatId;
    }
    await bot.setChatMenuButton(form);
    logToFile('INFO', `Chat Menu Button сброшен на default${chatId ? ` для ${chatId}` : ' (глобально)'}`);
  } catch (err) {
    logToFile('WARN', `Сброс Menu Button: ${err.message}`);
  }
}

// Сброс кнопки меню при старте
resetChatMenuButton().catch(() => {});

/**
 * Главная Reply-клавиатура прямого нативного чат-биллинга
 */
function getReplyKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        [
          { text: 'ℹ️ Где взять Device ID?' },
          { text: '❓ Помощь' }
        ]
      ],
      resize_keyboard: true
    }
  };
}

const MAIN_KEYBOARD = getReplyKeyboard();

/**
 * Проверка и извлечение Device ID из строки
 * Поддерживает форматы KLAD-XXXXXXXX-XXXX, а также hex/alphanumeric строки от 8 символов
 * @param {string} text Входящий текст
 * @returns {string|null} Распознанный Device ID или null
 */
function parseDeviceId(text) {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();

  // 1. Поиск явного префикса KLAD-
  const matchKlad = clean.match(/KLAD-[A-Z0-9_-]{4,32}/i);
  if (matchKlad) {
    return matchKlad[0].toUpperCase();
  }

  // 2. Поиск по общей сигнатуре [A-Z0-9_-]{8,}
  const matchGeneral = clean.match(/\b([A-Z0-9_-]{8,32})\b/i);
  if (matchGeneral) {
    const candidate = matchGeneral[1].toUpperCase();
    const reserved = ['START', 'HELP', 'STARS', 'BUY', 'DEVICE', 'LICENSE', 'INFO', 'CANCEL', 'PRO'];
    if (!reserved.includes(candidate)) {
      return candidate.startsWith('KLAD-') ? candidate : `KLAD-${candidate}`;
    }
  }

  return null;
}

/**
 * Отправка карточки заказа с выбором способов оплаты (СБП / Telegram Stars)
 * @param {number|string} chatId ID чата
 * @param {string} deviceId Идентификатор устройства
 */
function sendPaymentMethodSelection(chatId, deviceId) {
  const cleanId = parseDeviceId(deviceId) || deviceId;
  const messageText = (
    `📱 Устройство для активации: \`${cleanId}\`\n` +
    `Тариф: PRO Бессрочный доступ\n\n` +
    `Выберите удобный способ оплаты:`
  );

  const inlineKeyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: `⚡ Оплатить ${PRICE_RUB} ₽ через СБП`,
            callback_data: `pay_sbp:${cleanId}`
          }
        ],
        [
          {
            text: `⭐ Оплатить ${PRO_STARS_PRICE} Star (Тест)`,
            callback_data: `pay_stars:${cleanId}`
          }
        ]
      ]
    }
  };

  logToFile('PAY_SELECT', `Отправка меню способов оплаты для ${cleanId} в чат ${chatId}`);

  return bot.sendMessage(chatId, messageText, {
    parse_mode: 'Markdown',
    ...inlineKeyboard,
    ...getReplyKeyboard()
  });
}

/**
 * Создание платежа через официальный API ЮKassa (СБП / карты РФ)
 * @param {string} deviceId Идентификатор устройства
 * @param {number|string} chatId ID чата в Telegram
 * @param {number} amount Сумма в рублях
 * @returns {Promise<{ id: string, confirmation_url: string }>}
 */
async function createYooKassaPayment(deviceId, chatId, amount = PRICE_RUB) {
  const cleanId = parseDeviceId(deviceId) || deviceId;

  if (YOOKASSA_TEST_MODE || !YOOKASSA_SHOP_ID || !YOOKASSA_SECRET_KEY || YOOKASSA_SHOP_ID === 'test_shop_id') {
    const mockPaymentId = `mock_yoo_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    logToFile('YOOKASSA_MOCK', `Создан mock-платеж ЮKassa ${mockPaymentId} на ${amount} ₽ для ${cleanId}`);
    return {
      id: mockPaymentId,
      confirmation_url: 'https://yookassa.ru/'
    };
  }

  const idempotenceKey = `${cleanId}-${Date.now()}`;
  const authHeader = 'Basic ' + Buffer.from(`${YOOKASSA_SHOP_ID}:${YOOKASSA_SECRET_KEY}`).toString('base64');

  const payload = {
    amount: {
      value: `${amount}.00`,
      currency: 'RUB'
    },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: 'https://t.me/KladActivation_bot'
    },
    description: `Лицензия «Прием Товара PRO» для устройства ${cleanId}`,
    metadata: {
      deviceId: cleanId,
      chatId: String(chatId)
    }
  };

  logToFile('YOOKASSA_REQ', `Запрос к ЮKassa v3/payments для ${cleanId} на ${amount} ₽`);

  const response = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Idempotence-Key': idempotenceKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    logToFile('ERROR', `Ошибка API ЮKassa HTTP ${response.status}: ${errorText}`);
    throw new Error(`ЮKassa HTTP ${response.status}: ${errorText}`);
  }

  const paymentData = await response.json();
  const confirmationUrl = paymentData.confirmation && paymentData.confirmation.confirmation_url;
  logToFile('YOOKASSA_RES', `Платеж ЮKassa создан ID: ${paymentData.id}, URL: ${confirmationUrl}`);

  return {
    id: paymentData.id,
    confirmation_url: confirmationUrl
  };
}

/**
 * Отправка инвойса Telegram Stars по запросу с Device ID
 * @param {number|string} chatId ID чата в Telegram
 * @param {string} deviceId Идентификатор устройства KLAD-XXXXXXXX-XXXX
 */
function sendStarsInvoice(chatId, deviceId) {
  const cleanId = parseDeviceId(deviceId) || deviceId;
  const title = 'Лицензия PRO Навсегда';
  const description = `Бессрочный доступ к «Прием Товара PRO» для устройства ${cleanId}`;
  const payload = `PRO_STARS:${cleanId}:${chatId}`;
  const providerToken = ''; // Для Telegram Stars строго пустая строка!
  const currency = 'XTR';
  const prices = [{ label: 'Прием Товара PRO (Бессрочно)', amount: PRO_STARS_PRICE }];

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
      start_parameter: cleanId,
      need_name: false,
      need_phone_number: false,
      need_email: false,
      need_shipping_address: false
    }
  );
}

/**
 * Выдача лицензионного ключа PRO после успешной оплаты
 * @param {number|string} chatId ID чата в Telegram
 * @param {string} deviceId Идентификатор устройства
 * @param {string} receiptId Идентификатор/чек платежа
 * @param {string} paymentSource Источник оплаты ('Stars' или 'СБП')
 */
function issueLicenseKey(chatId, deviceId, receiptId, paymentSource = 'Stars') {
  const cleanId = parseDeviceId(deviceId) || deviceId;
  const now = Date.now();
  const licenseKey = generateLicenseKey(cleanId, now);

  const successMsg = (
    `🎉 *Оплата ${paymentSource} успешно получена!*\n\n` +
    `Ваш лицензионный ключ PRO:\n` +
    `\`${licenseKey}\`\n\n` +
    `_(Нажмите на ключ, чтобы скопировать)_\n\n` +
    `📱 *Устройство:* \`${cleanId}\`\n` +
    `🧾 *Чек транзакции:* \`${receiptId}\`\n\n` +
    `*Инструкция:* вставьте этот ключ в приложении «Прием Товара» в поле активации и нажмите «Активировать».`
  );

  bot.sendMessage(chatId, successMsg, {
    parse_mode: 'Markdown',
    ...getReplyKeyboard()
  });

  logToFile('KEY_GENERATED', `Ключ ${licenseKey} выдан через ${paymentSource} для ${cleanId} в чат ${chatId}`);
}

/**
 * Обработка успешного платежа через Telegram Stars
 * @param {Object} msg Объект входящего сообщения Telegram с successful_payment
 */
function handleSuccessfulPayment(msg) {
  const payment = msg.successful_payment;
  if (!payment) return;

  const chatId = msg.chat.id;
  const payload = payment.invoice_payload || '';
  const chargeId = payment.telegram_payment_charge_id;

  logToFile('PAYMENT_SUCCESS', `Чек Stars: ${chargeId}, Сумма: ${payment.total_amount} ${payment.currency}, Payload: ${payload}`);

  // Извлекаем Device ID из payload: "PRO_STARS:KLAD-XXXXXXXX-XXXX:chatId"
  const parts = payload.split(':');
  const rawId = parts[1] || '';
  const deviceId = parseDeviceId(rawId) || rawId;

  if (deviceId) {
    issueLicenseKey(chatId, deviceId, chargeId, 'Telegram Stars');
  } else {
    bot.sendMessage(
      chatId,
      `✅ *Оплата Stars получена!* (Чек: \`${chargeId}\`)\n\n` +
      `Пожалуйста, отправьте ваш *Device ID* (например, \`KLAD-XXXXXXXX-XXXX\`) для генерации ключа.`,
      {
        parse_mode: 'Markdown',
        ...getReplyKeyboard()
      }
    );
    logToFile('WARN', `Оплата Stars получена, но Device ID не распознан: "${payload}"`);
  }
}

// 1. Слушатель pre_checkout_query: валидация заказа Telegram Stars
bot.on('pre_checkout_query', async (query) => {
  const payload = query.invoice_payload || '';
  logToFile('PRE_CHECKOUT_QUERY', `ID: ${query.id}, От: ${query.from?.id} (@${query.from?.username || ''}), Сумма: ${query.total_amount} ${query.currency}, Payload: ${payload}`);

  try {
    if (payload.startsWith('PRO_STARS:') && query.total_amount === PRO_STARS_PRICE && query.currency === 'XTR') {
      await bot.answerPreCheckoutQuery(query.id, true);
      logToFile('INFO', `pre_checkout_query ${query.id} успешно подтвержден`);
    } else {
      logToFile('WARN', `pre_checkout_query ${query.id} отклонен`);
      await bot.answerPreCheckoutQuery(query.id, false, {
        error_message: 'Недействительный заказ или изменилась сумма счета.'
      });
    }
  } catch (err) {
    logToFile('ERROR', `Ошибка в pre_checkout_query: ${err.message}`);
    try {
      await bot.answerPreCheckoutQuery(query.id, false, {
        error_message: 'Произошла ошибка при обработке платежа. Попробуйте еще раз.'
      });
    } catch (e) {}
  }
});

// 2. Слушатель successful_payment (Stars)
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

  try {
    await bot.answerCallbackQuery(query.id);
  } catch (e) {}

  // Выбор оплаты Stars
  if (data.startsWith('pay_stars:') || data.startsWith('PAY_STARS:')) {
    const rawId = data.replace(/^pay_stars:|^PAY_STARS:/, '');
    const deviceId = parseDeviceId(rawId) || rawId;
    try {
      await sendStarsInvoice(chatId, deviceId);
    } catch (err) {
      logToFile('ERROR', `Ошибка при отправке инвойса из callback_query: ${err.message}`);
      bot.sendMessage(chatId, '❌ Не удалось выставить счет Telegram Stars. Попробуйте еще раз позже.', getReplyKeyboard());
    }
    return;
  }

  // Выбор оплаты СБП через ЮKassa
  if (data.startsWith('pay_sbp:')) {
    const rawId = data.replace('pay_sbp:', '');
    const deviceId = parseDeviceId(rawId) || rawId;

    if (YOOKASSA_TEST_MODE) {
      const sbpText = (
        `⚡ *Оплата через СБП (Тестовый режим)*\n\n` +
        `Сумма к оплате: *${PRICE_RUB} ₽*\n` +
        `Устройство: \`${deviceId}\`\n\n` +
        `Для проверки нажмите «Оплатить» или эмулируйте моментальную успешную оплату:`
      );

      const sbpKeyboard = {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: `📱 Оплатить ${PRICE_RUB} ₽ (Тест СБП)`,
                url: 'https://yookassa.ru/'
              }
            ],
            [
              {
                text: '✅ Эмулировать успешную оплату СБП',
                callback_data: `test_sbp_success:${deviceId}`
              }
            ],
            [
              {
                text: '« Назад к выбору оплаты',
                callback_data: `back_select:${deviceId}`
              }
            ]
          ]
        }
      };

      bot.sendMessage(chatId, sbpText, {
        parse_mode: 'Markdown',
        ...sbpKeyboard
      });
    } else {
      try {
        const payment = await createYooKassaPayment(deviceId, chatId, PRICE_RUB);
        const sbpText = (
          `⚡ *Оплата через СБП (ЮKassa)*\n\n` +
          `Сумма: *${PRICE_RUB} ₽*\n` +
          `Устройство: \`${deviceId}\`\n\n` +
          `Нажмите кнопку ниже для перехода к оплате в приложении вашего банка через СБП:`
        );

        bot.sendMessage(chatId, sbpText, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: `⚡ Оплатить ${PRICE_RUB} ₽ по СБП`,
                  url: payment.confirmation_url
                }
              ]
            ]
          }
        });
      } catch (err) {
        logToFile('ERROR', `Ошибка создания платежа ЮKassa: ${err.message}`);
        bot.sendMessage(chatId, '❌ Не удалось инициировать оплату СБП. Пожалуйста, выберите оплату Telegram Stars или повторите попытку позже.', getReplyKeyboard());
      }
    }
    return;
  }

  // Эмуляция успешной оплаты СБП
  if (data.startsWith('test_sbp_success:')) {
    const rawId = data.replace('test_sbp_success:', '');
    const deviceId = parseDeviceId(rawId) || rawId;
    const testReceiptId = `TEST-SBP-${Date.now()}`;
    issueLicenseKey(chatId, deviceId, testReceiptId, 'СБП (Тест)');
    return;
  }

  // Возврат к выбору оплаты
  if (data.startsWith('back_select:')) {
    const rawId = data.replace('back_select:', '');
    const deviceId = parseDeviceId(rawId) || rawId;
    sendPaymentMethodSelection(chatId, deviceId);
  }
});

// 4. Команда /start
bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const name = msg.from ? (msg.from.first_name || 'Пользователь') : 'Пользователь';
  const rawParam = match && match[1] ? match[1].trim() : '';
  const deviceId = parseDeviceId(rawParam);

  logToFile('COMMAND_START', `Чат: ${chatId}, Имя: "${name}", Параметр: "${rawParam}", DeviceID: ${deviceId || 'нет'}`);

  resetChatMenuButton(chatId).catch(() => {});

  if (deviceId) {
    sendPaymentMethodSelection(chatId, deviceId);
    return;
  }

  const welcomeText = (
    `👋 Добро пожаловать в бот активации приложения «Прием Товара»!\n` +
    `Здесь вы можете приобрести бессрочную PRO-лицензию для своего устройства или для устройства сотрудника.\n\n` +
    `Чтобы купить лицензию, просто отправьте мне Device ID (например, \`KLAD-XXXXXXXX-XXXX\`).`
  );

  bot.sendMessage(chatId, welcomeText, {
    parse_mode: 'Markdown',
    ...getReplyKeyboard()
  });
});

// 5. Команда /help
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  logToFile('COMMAND_HELP', `Чат: ${chatId}`);

  const helpText = (
    `❓ *Как активировать PRO-версию:*\n\n` +
    `1. В приложении «Прием Товара» откройте окно активации и нажмите «📋 Скопировать ID».\n` +
    `2. Отправьте скопированный Device ID в этот чат.\n` +
    `3. Выберите удобный способ оплаты: *СБП (${PRICE_RUB} ₽)* или *Telegram Stars (${PRO_STARS_PRICE} ⭐)*.\n` +
    `4. Оплатите заказ прямо в приложении банка (СБП) или в Telegram (Stars).\n` +
    `5. Сразу после оплаты бот пришлет персональный лицензионный ключ.\n` +
    `6. Вставьте ключ в приложении и нажмите «Активировать».\n\n` +
    `✨ Лицензия активируется навсегда для указанного устройства!`
  );

  bot.sendMessage(chatId, helpText, {
    parse_mode: 'Markdown',
    ...getReplyKeyboard()
  });
});

// 6. Команда /stars или /buy
bot.onText(/\/(?:stars|buy)(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  const rawArg = match && match[1] ? match[1].trim() : '';
  const deviceId = parseDeviceId(rawArg);

  logToFile('COMMAND_STARS', `Чат: ${chatId}, Аргумент: "${rawArg}", DeviceID: ${deviceId || 'нет'}`);

  if (deviceId) {
    sendPaymentMethodSelection(chatId, deviceId);
  } else {
    bot.sendMessage(
      chatId,
      `⭐ *Оплата лицензии «Прием Товара PRO»*\n\n` +
      `Отправьте ваш Device ID для перехода к выбору оплаты:\n` +
      `\`/buy KLAD-XXXXXXXX-XXXX\``,
      {
        parse_mode: 'Markdown',
        ...getReplyKeyboard()
      }
    );
  }
});

// 7. Обработка входящих текстовых сообщений
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const fromUser = msg.from ? `${msg.from.first_name || ''} (@${msg.from.username || 'no_user'}, id:${msg.from.id})` : 'Unknown';

  logToFile('MESSAGE', `От: ${fromUser}, Чат: ${chatId}, Текст: "${msg.text || ''}"`, {
    successful_payment: !!msg.successful_payment
  });

  // Проверка успешной оплаты в потоке сообщений
  if (msg.successful_payment) {
    handleSuccessfulPayment(msg);
    return;
  }

  if (!msg.text) return;
  const text = msg.text.trim();

  // Игнорируем команды со слешем, они обрабатываются onText
  if (text.startsWith('/')) return;

  // Кнопка "ℹ️ Где взять Device ID?"
  if (text.includes('Где взять Device ID')) {
    const infoText = 'В приложении «Прием Товара» откройте окно «Купить / Активировать» и нажмите кнопку «📋 Скопировать ID». Затем просто вставьте скопированный текст сюда в чат.';
    bot.sendMessage(chatId, infoText, getReplyKeyboard());
    return;
  }

  // Кнопка "❓ Помощь"
  if (text.includes('Помощь')) {
    const helpText = (
      `❓ *Как активировать PRO-версию:*\n\n` +
      `1. В приложении «Прием Товара» откройте окно активации и нажмите «📋 Скопировать ID».\n` +
      `2. Отправьте скопированный Device ID в этот чат.\n` +
      `3. Выберите удобный способ оплаты: *СБП (${PRICE_RUB} ₽)* или *Telegram Stars (${PRO_STARS_PRICE} ⭐)*.\n` +
      `4. Оплатите заказ прямо в приложении банка (СБП) или в Telegram (Stars).\n` +
      `5. Сразу после оплаты бот пришлет персональный лицензионный ключ.\n` +
      `6. Вставьте ключ в приложении и нажмите «Активировать».\n\n` +
      `✨ Лицензия активируется навсегда для указанного устройства!`
    );
    bot.sendMessage(chatId, helpText, {
      parse_mode: 'Markdown',
      ...getReplyKeyboard()
    });
    return;
  }

  // Проверяем, является ли сообщение Device ID
  const deviceId = parseDeviceId(text);

  if (deviceId) {
    sendPaymentMethodSelection(chatId, deviceId);
  } else {
    // Нераспознанный текст
    bot.sendMessage(
      chatId,
      `❓ Не удалось распознать Device ID.\n\n` +
      `Чтобы купить лицензию, отправьте ваш идентификатор устройства (например, \`KLAD-XXXXXXXX-XXXX\`) или нажмите кнопку «ℹ️ Где взять Device ID?».`,
      {
        parse_mode: 'Markdown',
        ...getReplyKeyboard()
      }
    );
  }
});

// Экспорт для тестирования
module.exports = {
  bot,
  sendStarsInvoice,
  createYooKassaPayment,
  sendPaymentMethodSelection,
  issueLicenseKey,
  handleSuccessfulPayment,
  parseDeviceId,
  PRO_STARS_PRICE,
  PRICE_RUB,
  YOOKASSA_TEST_MODE,
  MAIN_KEYBOARD,
  getReplyKeyboard,
  resetChatMenuButton,
  logToFile
};

// Первичная запись в лог при запуске
logToFile('STARTUP', `🤖 Telegram-бот «Кладовщик» запущен (Stars + ЮKassa СБП, Тест-режим: ${YOOKASSA_TEST_MODE})`);
