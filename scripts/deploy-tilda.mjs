#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(root, '..', '..');
const pageId = '148201326';

function extractCredentials(text) {
  const tildaSection = text.match(/###\s+2\.4\s+Tilda([\s\S]*?)(?=\n###|$)/i)?.[1] || '';
  const login = tildaSection.match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0];
  const password = tildaSection.match(/\|\s*(?:Пароль|Password)\s*\|\s*`([^`]+)`/i)?.[1]?.trim();
  if (!login || !password) throw new Error('Tilda credentials were not found in MAIN_DOCUMENT.md');
  return { login, password };
}

const doc = await fs.readFile(path.join(projectRoot, 'MAIN_DOCUMENT.md'), 'utf8');
const html = await fs.readFile(path.join(root, 'tilda-embed.html'), 'utf8');
const { login, password } = extractCredentials(doc);
const backupDir = path.join(root, 'backups');
await fs.mkdir(backupDir, { recursive: true });

const browser = await puppeteer.launch({
  headless: true,
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  defaultViewport: { width: 1440, height: 900 },
  args: ['--disable-blink-features=AutomationControlled', '--disable-http2', '--disable-quic'],
  userDataDir: '/tmp/zapovedny-tilda-profile',
});
const page = await browser.newPage();
await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36');
const responses = [];
page.on('response', response => {
  const url = response.url();
  if (/record|save|update/i.test(url)) responses.push([response.request().method(), url, response.status()]);
});

async function gotoWithRetry(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
  throw lastError;
}

try {
  await gotoWithRetry('https://tilda.ru/projects/');
  if (page.url().includes('/login')) {
    await page.locator('input[type="email"], input[name="email"]').fill(login);
    await page.locator('input[type="password"], input[name="password"]').fill(password);
    await page.locator('button[type="submit"], input[type="submit"]').click();
    await new Promise(resolve => setTimeout(resolve, 3500));
  }
  if (page.url().includes('/login')) {
    let captchaClicked = false;
    for (const frame of page.frames()) {
      const checkbox = await frame.$('.CheckboxCaptcha-Button, [role="checkbox"], input[type="checkbox"]');
      if (checkbox) {
        await checkbox.click();
        captchaClicked = true;
        break;
      }
    }
    if (!captchaClicked) {
      const captchaFrame = await page.$('iframe[src*="captcha"], iframe[title*="captcha" i]');
      const box = captchaFrame && await captchaFrame.boundingBox();
      if (box) {
        await page.mouse.click(box.x + 30, box.y + box.height / 2);
        captchaClicked = true;
      }
    }
    if (captchaClicked) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      await page.locator('button[type="submit"], input[type="submit"]').click();
    }
  }
  await new Promise(resolve => setTimeout(resolve, 7000));
  const loginBody = await page.$eval('body', node => node.innerText);
  await page.screenshot({ path: '/tmp/zapovedny-tilda-after-login.png', fullPage: true });
  console.log(JSON.stringify({ afterLoginUrl: page.url(), loginBody: loginBody.slice(0, 1200) }));
  if (page.url().includes('/login')) throw new Error('Tilda login did not complete');

  await gotoWithRetry(`https://tilda.ru/page/?pageid=${pageId}`);
  await new Promise(resolve => setTimeout(resolve, 8000));

  let record = await page.$('.record[data-record-type="131"]');
  if (!record) {
    await page.locator('[data-open-library]').click();
    await page.waitForSelector('.tp-library__search-input', { timeout: 15000 });
    await page.evaluate(() => {
      const input = document.querySelector('.tp-library__search-input');
      const searchButton = document.elementFromPoint(229, 29);
      searchButton?.click();
      input?.focus();
    });
    await page.waitForSelector('.tp-library__search-input', { visible: true, timeout: 15000 });
    await page.locator('.tp-library__search-input').fill('T123');
    await new Promise(resolve => setTimeout(resolve, 1000));
    await page.evaluate(() => {
      const items = [...document.querySelectorAll('*')].filter(node => node.textContent?.trim() === 'T123');
      const visible = items.filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      visible.at(-1)?.click();
    });
    await page.waitForSelector('.record[data-record-type="131"]', { visible: true, timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 2000));
    record = await page.$('.record[data-record-type="131"]');
  }
  const recordId = await record.evaluate(node => node.getAttribute('recordid'));
  await record.hover();
  const box = await record.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(20, box.height / 4));
  await new Promise(resolve => setTimeout(resolve, 1200));
  const contentControls = await page.$$('button, a, div');
  const matchingControls = [];
  for (const element of contentControls) {
    const text = await element.evaluate(node => (node.textContent || '').trim());
    if (text === 'Контент') matchingControls.push(element);
  }
  console.log(JSON.stringify({ url: page.url(), recordFound: Boolean(record), contentControls: matchingControls.length }));
  await page.screenshot({ path: '/tmp/zapovedny-tilda-editor.png', fullPage: true });
  if (!matchingControls.length) throw new Error('T123 content control was not found');

  await matchingControls.at(-1).click();
  await page.waitForSelector('textarea', { visible: true, timeout: 15000 });
  const textarea = await page.$('textarea');
  const previous = await textarea.evaluate(node => node.value);
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const backup = path.join(backupDir, `page${pageId}_record${recordId}_${stamp}.json`);
  await fs.writeFile(backup, JSON.stringify({ pageId, recordId, code: previous }, null, 2));

  await textarea.evaluate((node, value) => {
    node.value = value;
    node.dispatchEvent(new Event('input', { bubbles: true }));
    node.dispatchEvent(new Event('change', { bubbles: true }));
  }, html);

  const saveButtons = await page.$$('button, a, div');
  let saved = false;
  for (const element of saveButtons.reverse()) {
    const text = await element.evaluate(node => (node.textContent || '').trim());
    if (/^Сохранить(?: и закрыть)?$/i.test(text)) {
      await element.click();
      saved = true;
      break;
    }
  }
  if (!saved) throw new Error('Save button was not found');
  await new Promise(resolve => setTimeout(resolve, 4000));
  console.log(JSON.stringify({ backup, saveResponses: responses.slice(-20) }, null, 2));
} finally {
  await browser.close();
}
