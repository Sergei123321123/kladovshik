const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HTML_PATH = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
const PORT = 9555;
const USER_DATA_DIR = path.join(os.tmpdir(), 'chrome_cdp_' + Date.now());

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.msgId = 0;
    this.pending = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = err => reject(err);
      this.ws.onmessage = event => {
        const msg = JSON.parse(event.data);
        if (msg.id && this.pending.has(msg.id)) {
          const { res, rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(JSON.stringify(msg.error)));
          else res(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    const id = ++this.msgId;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return r.result?.value;
  }

  close() {
    try { this.ws.close(); } catch (e) {}
  }
}

async function main() {
  console.log('Запуск отдельного экземпляра Chrome на порту ' + PORT + '...');
  const chromeProcess = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${USER_DATA_DIR}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    HTML_PATH
  ], { detached: false });

  chromeProcess.on('error', (err) => {
    console.error('Ошибка запуска Chrome:', err);
    process.exit(1);
  });

  try {
    // Ждем инициализации CDP
    let targets = null;
    for (let i = 0; i < 30; i++) {
      try {
        targets = await getJson(`http://127.0.0.1:${PORT}/json`);
        if (targets && targets.length > 0) break;
      } catch (e) {}
      await sleep(250);
    }

    if (!targets || targets.length === 0) {
      throw new Error('Не удалось получить цели CDP от Chrome');
    }

    const pageTarget = targets.find(t => t.type === 'page') || targets[0];
    console.log('Подключение к WebSocket:', pageTarget.webSocketDebuggerUrl, 'URL:', pageTarget.url);

    const client = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();

    // Включаем необходимые домены
    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('DOM.enable');

    await client.send('Page.navigate', { url: HTML_PATH });
    await sleep(1000);
    await client.send('Runtime.enable');
    await client.send('DOM.enable');

    // Настраиваем разрешение 1080x1920 (соотношение 9:16)
    // 432 x 768 при deviceScaleFactor = 2.5 дает ровно 1080 x 1920
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 432,
      height: 768,
      deviceScaleFactor: 2.5,
      mobile: true,
      fitWindow: false
    });

    console.log('Настройка демонстрационных данных в приложении...');
    await client.eval(`
      localStorage.setItem('kladovshik_pro_license', 'true');
      localStorage.setItem('kladovshik_lang', 'ru');
      
      if (typeof switchLanguage === 'function') {
        switchLanguage('ru');
      }

      state.session.name = 'Приемка #14 — Фура А123ВС';
      document.getElementById('sessionNameInput').value = state.session.name;

      state.products = [
        {
          id: 'p1',
          name: 'Томаты Сливка',
          theme: 'theme-green',
          unitsPerBox: 12,
          boxesPerPallet: 32,
          variants: [
            {
              id: 'v1',
              name: 'Сорт 1 (Красные)',
              stdPallets: 4,
              looseBoxes: 18,
              looseUnits: 6,
              customPallets: [
                { id: 'cp1', boxes: 14 }
              ]
            },
            {
              id: 'v2',
              name: 'Сорт 2',
              stdPallets: 2,
              looseBoxes: 6,
              looseUnits: 0,
              customPallets: []
            }
          ]
        },
        {
          id: 'p2',
          name: 'Огурцы Луховицкие',
          theme: 'theme-blue',
          unitsPerBox: 10,
          boxesPerPallet: 28,
          variants: [
            {
              id: 'v3',
              name: 'Стандарт',
              stdPallets: 3,
              looseBoxes: 12,
              looseUnits: 0,
              customPallets: []
            }
          ]
        },
        {
          id: 'p3',
          name: 'Перец Болгарский',
          theme: 'theme-amber',
          unitsPerBox: 8,
          boxesPerPallet: 20,
          variants: [
            {
              id: 'v4',
              name: 'Желтый',
              stdPallets: 1,
              looseBoxes: 5,
              looseUnits: 4,
              customPallets: []
            }
          ]
        }
      ];

      state.activeProductIndex = 0;
      state.activeVariantIndex = 0;
      saveState();

      renderHeader();
      renderProductsBar();
      renderVariantsBar();
      renderNamesInputs();
      renderQuants();
      renderCustomPalletsList();
      updateTotalDisplay();
    `);

    await sleep(500);

    const screensDir = path.resolve('rustore_kit/screens');
    fs.mkdirSync(screensDir, { recursive: true });

    // --- Скриншот 1: Главный рабочий экран счетчика ---
    console.log('Съемка screen1_counter.png...');
    const s1 = await client.send('Page.captureScreenshot', { format: 'png' });
    const p1 = path.join(screensDir, 'screen1_counter.png');
    fs.writeFileSync(p1, Buffer.from(s1.data, 'base64'));
    console.log(`[OK] Сохранен ${p1}`);

    // --- Скриншот 2: Модальное окно добавления нестандартного поддона ---
    console.log('Съемка screen2_custom_pallet.png...');
    await client.eval(`
      openCustomPalletModal();
      const inp = document.getElementById('customPalletBoxesInput');
      if (inp) inp.value = '16';
    `);
    await sleep(400);

    const s2 = await client.send('Page.captureScreenshot', { format: 'png' });
    const p2 = path.join(screensDir, 'screen2_custom_pallet.png');
    fs.writeFileSync(p2, Buffer.from(s2.data, 'base64'));
    console.log(`[OK] Сохранен ${p2}`);

    // Закрываем модальное окно кастомного поддона
    await client.eval(`closeCustomPalletModal();`);
    await sleep(300);

    // --- Скриншот 3: Модальное окно экспорта отчета («Отправить XLSX / HTML») ---
    console.log('Съемка screen3_export.png...');
    await client.eval(`
      openShareReportModal();
    `);
    await sleep(400);

    const s3 = await client.send('Page.captureScreenshot', { format: 'png' });
    const p3 = path.join(screensDir, 'screen3_export.png');
    fs.writeFileSync(p3, Buffer.from(s3.data, 'base64'));
    console.log(`[OK] Сохранен ${p3}`);

    client.close();
    console.log('Все 3 скриншота успешно сняты!');
  } finally {
    try {
      chromeProcess.kill();
    } catch (e) {}
    try {
      fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
    } catch (e) {}
  }
}

main().catch(err => {
  console.error('Ошибка скрипта скриншотов:', err);
  process.exit(1);
});
