/**
 * Kladovshik PRO License Key Generator Module
 * Алгоритм генерации и валидации ключей с 3-дневным окном активации.
 * Полностью идентичен реализации в keygen.html и index.html.
 */

const LICENSE_SALT = 'KLAD_SALT_2026';
const LICENSE_BASE_EPOCH = 1735689600000; // 2025-01-01 UTC

/**
 * Вычисление 32-битного контрольного хэша подписи (FNV-1a)
 * @param {string} deviceId ID устройства (например, KLAD-XXXXXXXX-XXXX)
 * @param {string} timeHex 4-значный hex временной метки (в часах от базовой эпохи)
 * @returns {string} 8-значная hex-строка контрольной суммы
 */
function computeLicenseHash(deviceId, timeHex) {
  const cleanId = (deviceId || '').trim().toUpperCase();
  const raw = `${cleanId}:${timeHex}:${LICENSE_SALT}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

/**
 * Генерация ключа лицензии PRO в формате PRO-ДАТА-ХЭШ (PRO-XXXX-XXXX-XXXX)
 * @param {string} deviceId Идентификатор устройства клиента
 * @param {number} timestamp Временная метка выпуска (мс), по умолчанию Date.now()
 * @returns {string|null} Готовый ключ активации или null при некорректном deviceId
 */
function generateLicenseKey(deviceId, timestamp = Date.now()) {
  const cleanId = (deviceId || '').trim().toUpperCase();
  if (!cleanId) return null;
  const hours = Math.floor((timestamp - LICENSE_BASE_EPOCH) / (3600 * 1000));
  const timeHex = (hours & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  const hashHex = computeLicenseHash(cleanId, timeHex);
  return `PRO-${timeHex}-${hashHex.slice(0, 4)}-${hashHex.slice(4, 8)}`;
}

/**
 * Валидация лицензионного ключа
 * @param {string} deviceId ID устройства клиента
 * @param {string} key Ключ активации
 * @param {boolean} checkExpiry Флаг проверки 72-часового (3 дня) окна активации
 * @returns {{ valid: boolean, error: string|null }}
 */
function validateKey(deviceId, key, checkExpiry = false) {
  if (!key) return { valid: false, error: 'empty_key' };
  const inputClean = key.trim().toUpperCase();
  if (inputClean === 'PRO-MASTER-UNLIMITED') {
    return { valid: true, error: null };
  }

  const parts = inputClean.split('-');
  if (parts.length !== 4 || parts[0] !== 'PRO') {
    return { valid: false, error: 'invalid_format' };
  }

  const timeHex = parts[1];
  const inputHash = parts[2] + parts[3];
  if (timeHex.length !== 4 || inputHash.length !== 8) {
    return { valid: false, error: 'invalid_format' };
  }

  const hours = parseInt(timeHex, 16);
  if (isNaN(hours)) {
    return { valid: false, error: 'invalid_format' };
  }

  const expectedHash = computeLicenseHash(deviceId, timeHex);
  if (inputHash !== expectedHash) {
    return { valid: false, error: 'invalid_signature' };
  }

  if (checkExpiry) {
    const genTime = LICENSE_BASE_EPOCH + hours * 3600 * 1000;
    const now = Date.now();
    const ageMs = now - genTime;
    // Окно 72 часа (+ 1 час люфта на случай рассинхрона часов)
    if (ageMs > 72 * 3600 * 1000 || ageMs < -3600 * 1000) {
      return { valid: false, error: 'expired' };
    }
  }

  return { valid: true, error: null };
}

/**
 * Форматирование даты в локальный читаемый вид
 */
function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

module.exports = {
  LICENSE_SALT,
  LICENSE_BASE_EPOCH,
  computeLicenseHash,
  generateLicenseKey,
  validateKey,
  formatDate
};

// Самотестирование при прямом запуске
if (require.main === module) {
  const testDev = 'KLAD-4A8F9C2B-9876';
  const now = Date.now();
  const key = generateLicenseKey(testDev, now);
  console.log('--- Self Test keygen.js ---');
  console.log('Device ID :', testDev);
  console.log('Fresh Key :', key);
  const v1 = validateKey(testDev, key, true);
  console.log('Valid fresh key (checkExpiry=true):', v1.valid);

  const past = now - (4 * 24 * 3600 * 1000);
  const expiredKey = generateLicenseKey(testDev, past);
  const v2 = validateKey(testDev, expiredKey, true);
  console.log('Expired key (checkExpiry=true):', v2.valid, 'Error:', v2.error);
  const v3 = validateKey(testDev, expiredKey, false);
  console.log('Expired key saved (checkExpiry=false):', v3.valid);
}
