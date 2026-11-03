// Loads .output/chrome-mv3 into Chrome with a throwaway profile and home folder, and drives the popup.
// Needs: npm run build:chrome, a release build of the helper, helper/vendor (fetch-engine.sh), ffmpeg.
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import {
  CHROME_ID, CHROME_REGISTRY_KEY, IS_WINDOWS, ROOT, Results, SCREENSHOTS, cleanUp, helperRunning, registryEntry,
  removeSavedFiles, savedFiles, scratch, sleep, startServer, writeHostManifest,
} from './lib.mjs';

const CHROME =
  process.env.CHROME_PATH ??
  {
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  }[process.platform] ??
  '/usr/bin/google-chrome';
const POPUP = `chrome-extension://${CHROME_ID}/popup.html`;
const results = new Results();
const server = await startServer();
const restore = [];

/**
 * Registers the helper for one test profile. Chrome also looks for host manifests in its profile folder,
 * which keeps the test away from the real ones; on Windows it only reads the registry.
 */
function registerHelper(profile) {
  const file = writeHostManifest(join(profile, 'NativeMessagingHosts'), { allowed_origins: [`chrome-extension://${CHROME_ID}/`] });
  restore.push(registryEntry(CHROME_REGISTRY_KEY, file));
}

async function launch({ withHelper }) {
  const profile = scratch('chrome-profile');
  const home = scratch('chrome-home');
  if (withHelper) registerHelper(profile);
  else restore.push(registryEntry(CHROME_REGISTRY_KEY, null));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    pipe: true,
    enableExtensions: [join(ROOT, '.output/chrome-mv3')],
    userDataDir: profile,
    env: { ...process.env, HOME: home },
    args: process.env.CI ? ['--no-sandbox'] : [],
  });
  // The extension loads after launch returns; opening the popup before that is refused (ERR_BLOCKED_BY_CLIENT).
  const target = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes(CHROME_ID), { timeout: 30000 });
  return { browser, home, profile, worker: await target.worker() };
}

async function openPopup(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height: 560, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
  await page.goto(POPUP);
  return { page, errors };
}

const find = async (page, url) => {
  await page.$eval('#link', (input) => (input.value = ''));
  await page.type('#link', url);
  await page.click('.link button');
};
const text = (page, selector) => page.$eval(selector, (e) => e.innerText.replace(/\n+/g, ' | '));
const waitFor = (page, fn, timeout, ...args) => page.waitForFunction(fn, { timeout }, ...args);
const storedCount = (worker) => worker.evaluate(async () => (await chrome.storage.local.get('downloads')).downloads?.length ?? 0);

try {
  const { browser, home, worker } = await launch({ withHelper: true });
  const { page, errors } = await openPopup(browser);

  await results.step('popup connects to the helper', () =>
    waitFor(page, () => document.querySelector('#save-body')?.innerText.includes('Open a page'), 20000));

  await results.step('refuses YouTube links (Chrome Web Store rule)', async () => {
    for (const url of ['https://www.youtube.com/watch?v=x', 'https://youtu.be/x', 'https://music.youtube.com/watch?v=x']) {
      await find(page, url);
      await waitFor(page, () => document.querySelector('#save-body').innerText.includes("can't save from YouTube"), 5000);
    }
    await page.screenshot({ path: join(SCREENSHOTS, 'chrome-youtube-blocked.png') });
  });

  await results.step('reads a video link', async () => {
    await find(page, server.clip);
    await page.waitForSelector('.option', { timeout: 60000 });
    return text(page, '#save-body');
  });

  await results.step('downloads a video into Movies/ClipSave', async () => {
    await page.click('.option');
    await waitFor(page, () => !document.querySelector('#panel-downloads').hidden, 5000);
    await page.waitForSelector('.item.done', { timeout: 60000 });
    await page.screenshot({ path: join(SCREENSHOTS, 'chrome-done.png') });
    const { video } = savedFiles(home);
    if (!video.some((f) => f.endsWith('.mp4'))) throw new Error(`saved: ${video.join(', ') || 'nothing'}`);
    return video.join(', ');
  });

  await results.step('right-click "Save audio" saves an MP3', async () => {
    const before = await storedCount(worker);
    await worker.evaluate((url) => chrome.contextMenus.onClicked.dispatch({ menuItemId: 'save-audio', pageUrl: url }, {}), server.clip);
    await waitFor(page, (n) => document.querySelectorAll('.item.done').length === n + 1, 60000, before);
    const { audio } = savedFiles(home);
    if (!audio.some((f) => f.endsWith('.mp3'))) throw new Error(`saved: ${audio.join(', ') || 'nothing'}`);
    return audio.join(', ');
  });

  await results.step('right-click on a YouTube link is refused too', async () => {
    const before = await storedCount(worker);
    await worker.evaluate(() =>
      chrome.contextMenus.onClicked.dispatch({ menuItemId: 'save-video', pageUrl: 'https://example.com', linkUrl: 'https://youtu.be/x' }, {}),
    );
    await sleep(800);
    if ((await storedCount(worker)) !== before) throw new Error('a download was queued');
  });

  await results.step('cancelling a running download removes it', async () => {
    await page.click('#tab-save');
    await find(page, server.slow);
    await page.waitForSelector('.option', { timeout: 60000 });
    await page.click('.option');
    await page.waitForSelector('.item.running', { timeout: 15000 });
    await page.screenshot({ path: join(SCREENSHOTS, 'chrome-running.png') });
    await page.click('.item.running .icon-button');
    await waitFor(page, () => !document.querySelector('.item.running'), 5000);
  });

  await results.step('clear finished empties the list', async () => {
    await page.click('.text-button');
    await waitFor(page, () => document.querySelector('#panel-downloads').innerText.includes('Videos you save'), 5000);
  });

  await results.step('helper exits after 30 idle seconds', async () => {
    await page.close();
    await sleep(35000);
    if (helperRunning(`clipsave-helper chrome-extension://${CHROME_ID}`)) throw new Error('still running');
  });

  const unexpected = errors.filter((e) => !/favicon/.test(e));
  results.check('no errors in the popup console', unexpected.length === 0, unexpected.join(' / '));
  await browser.close();

  removeSavedFiles(home);

  const missing = await launch({ withHelper: false });
  const { page: lonely } = await openPopup(missing.browser);
  await results.step('shows the install command when the helper is missing', async () => {
    await waitFor(lonely, () => document.querySelector('#save-body').innerText.includes('One more step'), 10000);
    await lonely.screenshot({ path: join(SCREENSHOTS, 'chrome-helper-missing.png') });
    const command = await text(lonely, '.command');
    if (!command.includes(IS_WINDOWS ? 'install.ps1' : 'install.sh')) throw new Error(command);
    return command;
  });

  await results.step('carries on by itself once the helper is installed', async () => {
    registerHelper(missing.profile);
    await waitFor(lonely, () => document.querySelector('#save-body').innerText.includes('Open a page'), 15000);
  });
  await missing.browser.close();
} finally {
  server.close();
  for (const undo of restore.reverse()) undo();
  cleanUp();
}

results.finish('Chrome');
