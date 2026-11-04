// Takes the README's pictures of the popup and Settings from the real Chrome build and the real helper, into
// docs/images. Needs what e2e/chrome.mjs needs, plus the internet: it reads three Blender open movies on YouTube
// for their titles, sizes and thumbnails. Run it with `npm run images` after a design change.
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';
import { CHROME_ID, CHROME_REGISTRY_KEY, ROOT, cleanUp, registryEntry, scratch, writeHostManifest } from './lib.mjs';

const CHROME =
  process.env.CHROME_PATH ??
  {
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    win32: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  }[process.platform] ??
  '/usr/bin/google-chrome';
const IMAGES = join(ROOT, 'docs/images');
const EXTENSION = `chrome-extension://${CHROME_ID}`;
// Blender's open movies: free to share, and on YouTube in every quality.
const MOVIES = {
  bunny: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
  sintel: 'https://www.youtube.com/watch?v=eRsGyueVLvQ',
  tears: 'https://www.youtube.com/watch?v=R6MlUcmOul8',
};
const restore = [];

async function launch({ withHelper }) {
  const profile = scratch('images-profile');
  const home = scratch('images-home');
  const manifest = withHelper
    ? writeHostManifest(join(profile, 'NativeMessagingHosts'), { allowed_origins: [`${EXTENSION}/`] })
    : null;
  restore.push(registryEntry(CHROME_REGISTRY_KEY, manifest));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    pipe: true,
    enableExtensions: [join(ROOT, '.output/chrome-mv3')],
    userDataDir: profile,
    env: { ...process.env, HOME: home },
    args: process.env.CI ? ['--no-sandbox'] : [],
  });
  const target = await browser.waitForTarget((t) => t.type() === 'service_worker' && t.url().includes(CHROME_ID), { timeout: 30000 });
  return { browser, home, worker: await target.worker() };
}

async function open(browser, path, { width, height, dark = false }) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  await page.goto(`${EXTENSION}/${path}`);
  return page;
}

const imagesLoaded = (page) =>
  page.waitForFunction(() => [...document.images].every((img) => img.complete), { timeout: 15000 }).catch(() => {});

/** The popup as Chrome shows it: 360 wide, as tall as its content up to the popup's 560. */
async function shootPopup(page, name) {
  await imagesLoaded(page);
  await new Promise((done) => setTimeout(done, 400)); // let the sliding thumbs and bars settle
  const height = await page.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
  await page.screenshot({ path: join(IMAGES, name), clip: { x: 0, y: 0, width: 360, height: Math.min(height, 560) } });
  console.log(`  ✓ ${name}`);
}

async function find(page, url) {
  await page.$eval('#link', (input) => (input.value = ''));
  await page.type('#link', url);
  await page.click('.link button');
  await page.waitForFunction(() => !!(document.querySelector('#download') || document.querySelector('.notice')), { timeout: 90000 });
  if (!(await page.$('#download'))) throw new Error(`couldn't read ${url}: ${await page.$eval('#save-body', (e) => e.innerText)}`);
  return page.$eval('#save-body', (body) => ({
    title: body.querySelector('.title')?.textContent ?? '',
    thumbnail: body.querySelector('img.thumb')?.src ?? null,
  }));
}

/** Writes home-folder paths the way people read them, so the picture shows ~/Movies/ClipSave, not a test folder. */
async function tidyPaths(page) {
  await new Promise((done) => setTimeout(done, 1000)); // the page redraws once the update check and folders are in
  await page.evaluate(() => {
    const home = /\S*clipsave-e2e-images-home-[^/\s]+/g;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) node.nodeValue = node.nodeValue.replace(home, '~');
    // The folders are editable fields.
    for (const field of document.querySelectorAll('input')) field.value = field.value.replace(home, '~');
  });
}

try {
  const { browser, home, worker } = await launch({ withHelper: true });

  // The quality picker, in both themes.
  const light = await open(browser, 'popup.html', { width: 360, height: 560 });
  await light.waitForFunction(() => document.querySelector('#save-body')?.innerText.includes('Open a page'), { timeout: 20000 });
  const movies = {};
  for (const [key, url] of Object.entries(MOVIES).reverse()) movies[key] = { url, ...(await find(light, url)) };
  await shootPopup(light, 'popup-picker.png');

  const dark = await open(browser, 'popup.html', { width: 360, height: 560, dark: true });
  await dark.waitForFunction(() => document.querySelector('#save-body')?.innerText.includes('Open a page'), { timeout: 20000 });
  await find(dark, MOVIES.bunny);
  await shootPopup(dark, 'popup-picker-dark.png');
  await dark.close();

  // The Downloads tab: one running, one saved video, one saved audio. The popup draws whatever the list in
  // storage says, so the list is written there directly instead of downloading three films.
  const now = Date.now();
  const item = (id, movie, change) => ({
    id, url: movie.url, title: movie.title, thumbnail: movie.thumbnail, quality: { kind: 'video', height: 1080 }, label: '1080p',
    status: 'done', percent: 100, speedBytes: null, etaSec: null, path: null, error: null, addedAt: now, ...change,
  });
  const downloads = [
    item('a', movies.bunny, { status: 'running', percent: 62, speedBytes: 4.8 * 1024 * 1024, etaSec: 24 }),
    item('b', movies.sintel, { path: join(home, 'Movies/ClipSave/Sintel.mp4') }),
    item('c', movies.tears, { quality: { kind: 'audio', format: 'mp3' }, label: 'MP3 audio', path: join(home, 'Music/ClipSave/Tears of Steel.mp3') }),
  ];
  await worker.evaluate((downloads) => chrome.storage.local.set({ downloads }), downloads);
  await light.click('#tab-downloads');
  await light.waitForSelector('.item.running', { timeout: 5000 });
  await shootPopup(light, 'popup-downloads.png');
  await worker.evaluate(() => chrome.storage.local.set({ downloads: [] }));
  await light.close();

  // Settings: updates, folders and theme. The About table below names this computer, so it's left out.
  const settings = await open(browser, 'options.html', { width: 880, height: 1200 });
  await settings.waitForFunction(() => document.querySelector('#about')?.innerText.includes('yt-dlp'), { timeout: 20000 });
  const check = await settings.$$('#updates button');
  for (const button of check) {
    if ((await button.evaluate((b) => b.textContent)).includes('Check now')) await button.click();
  }
  await settings
    .waitForFunction(() => !document.querySelector('#updates')?.innerText.includes('Checking'), { timeout: 20000 })
    .catch(() => {});
  await tidyPaths(settings);
  const bottom = await settings.$eval('#appearance', (section) => Math.ceil(section.getBoundingClientRect().bottom + window.scrollY + 24));
  await settings.screenshot({ path: join(IMAGES, 'settings.png'), clip: { x: 0, y: 0, width: 880, height: bottom } });
  console.log('  ✓ settings.png');
  await browser.close();

  // The one-time setup, when the helper isn't installed yet.
  const missing = await launch({ withHelper: false });
  const setup = await open(missing.browser, 'popup.html', { width: 360, height: 560 });
  await setup.waitForFunction(() => document.querySelector('#save-body').innerText.includes('One more step'), { timeout: 10000 });
  await shootPopup(setup, 'popup-helper-missing.png');
  await missing.browser.close();
} finally {
  for (const undo of restore.reverse()) undo();
  cleanUp();
}
