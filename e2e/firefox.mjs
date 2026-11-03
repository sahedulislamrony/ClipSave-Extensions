// Loads .output/firefox-mv2 into Firefox with a throwaway profile and home folder, and drives the popup.
// Speaks Marionette directly: WebDriver BiDi won't open moz-extension:// pages.
// Needs: npm run build:firefox, a release build of the helper, helper/vendor (fetch-engine.sh), ffmpeg.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { connect } from 'node:net';
import { join } from 'node:path';
import {
  FIREFOX_ID, ROOT, Results, SCREENSHOTS, cleanUp, helperRunning, savedFiles, scratch, sleep, startServer,
  writeHostManifest,
} from './lib.mjs';

const FIREFOX =
  process.env.FIREFOX_PATH ??
  (process.platform === 'darwin' ? '/Applications/Firefox.app/Contents/MacOS/firefox' : 'firefox');
const UUID = '3f2b1c9e-7d44-4a57-9b1e-2c6d8f0a1b23';
const PORT = 2829;
const results = new Results();
const server = await startServer();

class Marionette {
  id = 0;
  pending = new Map();
  buffer = Buffer.alloc(0);

  async open() {
    for (let attempt = 0; ; attempt++) {
      try {
        await new Promise((done, fail) => {
          this.socket = connect(PORT, '127.0.0.1', done);
          this.socket.once('error', fail);
        });
        break;
      } catch (error) {
        if (attempt > 150) throw error;
        await sleep(200);
      }
    }
    const hello = new Promise((done) => (this.hello = done));
    this.socket.on('data', (data) => this.read(data));
    await hello;
    await this.send('WebDriver:NewSession', {});
  }

  read(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    for (;;) {
      const colon = this.buffer.indexOf(':');
      if (colon < 0) return;
      const length = Number(this.buffer.subarray(0, colon).toString());
      if (this.buffer.length < colon + 1 + length) return;
      const body = JSON.parse(this.buffer.subarray(colon + 1, colon + 1 + length).toString());
      this.buffer = this.buffer.subarray(colon + 1 + length);
      if (!Array.isArray(body)) {
        this.hello?.();
        continue;
      }
      const [, id, error, result] = body;
      const waiter = this.pending.get(id);
      this.pending.delete(id);
      if (error) waiter?.fail(new Error(`${error.error}: ${error.message}`));
      else waiter?.done(result);
    }
  }

  send(name, params = {}) {
    const id = ++this.id;
    const body = JSON.stringify([0, id, name, params]);
    this.socket.write(`${Buffer.byteLength(body)}:${body}`);
    return new Promise((done, fail) => this.pending.set(id, { done, fail }));
  }

  async run(script) {
    return (await this.send('WebDriver:ExecuteScript', { script, args: [] })).value;
  }

  async until(script, timeout) {
    const end = Date.now() + timeout;
    for (;;) {
      if (await this.run(script)) return;
      if (Date.now() > end) throw new Error(`timed out after ${timeout} ms`);
      await sleep(250);
    }
  }

  async screenshot(name) {
    const { value } = await this.send('WebDriver:TakeScreenshot', {});
    writeFileSync(join(SCREENSHOTS, name), Buffer.from(value, 'base64'));
  }
}

async function launch({ withHelper }) {
  const home = scratch('firefox-home');
  const profile = scratch('firefox-profile');
  if (withHelper) {
    const dir =
      process.platform === 'darwin'
        ? join(home, 'Library/Application Support/Mozilla/NativeMessagingHosts')
        : join(home, '.mozilla/native-messaging-hosts');
    writeHostManifest(dir, { allowed_extensions: [FIREFOX_ID] });
  }
  writeFileSync(
    join(profile, 'user.js'),
    [
      `user_pref("marionette.port", ${PORT});`,
      `user_pref("extensions.webextensions.uuids", ${JSON.stringify(JSON.stringify({ [FIREFOX_ID]: UUID }))});`,
      'user_pref("browser.shell.checkDefaultBrowser", false);',
      'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
      'user_pref("browser.aboutwelcome.enabled", false);',
    ].join('\n'),
  );
  const firefox = spawn(FIREFOX, ['--headless', '--marionette', '--remote-allow-system-access', '--no-remote', '--profile', profile], {
    stdio: 'ignore',
    env: {
      ...process.env,
      HOME: home,
      CFFIXED_USER_HOME: home,
      MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: '1',
      MOZ_HEADLESS_WIDTH: '360',
      MOZ_HEADLESS_HEIGHT: '640',
    },
  });
  const client = new Marionette();
  await client.open();
  await client.send('Addon:Install', { path: join(ROOT, '.output/firefox-mv2'), temporary: true });

  // Content can't navigate to extension pages, so open the popup in a tab from the browser itself.
  const before = await client.send('WebDriver:GetWindowHandles');
  await client.send('Marionette:SetContext', { value: 'chrome' });
  await client.run(`
    const win = Services.wm.getMostRecentWindow('navigator:browser');
    win.gBrowser.selectedTab = win.gBrowser.addTab('moz-extension://${UUID}/popup.html', {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
  `);
  await client.send('Marionette:SetContext', { value: 'content' });
  let handle;
  while (!handle) {
    handle = (await client.send('WebDriver:GetWindowHandles')).find((h) => !before.includes(h));
    await sleep(100);
  }
  await client.send('WebDriver:SwitchToWindow', { handle, focus: true });

  const close = async () => {
    await client.send('Marionette:Quit').catch(() => {});
    await new Promise((done) => {
      firefox.once('exit', done);
      setTimeout(() => (firefox.kill(), done()), 8000);
    });
  };
  return { client, home, close };
}

const find = (url) => `
  const input = document.querySelector('#link');
  input.value = ${JSON.stringify(url)};
  document.querySelector('.link button').click();`;
const BODY = `return document.querySelector('#save-body').innerText.replace(/\\n+/g, ' | ')`;

try {
  const { client, home, close } = await launch({ withHelper: true });

  await results.step('popup connects to the helper', () =>
    client.until(`return document.querySelector('#save-body')?.innerText.includes('Open a page')`, 20000));

  await results.step('lets YouTube links through to the helper (Firefox build)', async () => {
    await client.run(find('https://www.youtube.com/watch?v=jNQXAC9IVRw'));
    await client.until(`return !!(document.querySelector('.option') || document.querySelector('.notice'))`, 90000);
    const shown = await client.run(BODY);
    if (shown.includes("can't save from YouTube")) throw new Error(shown);
    if (await client.run(`return !!document.querySelector('.option')`)) {
      // The thumbnail comes from YouTube; it should load in the extension page.
      await client.until(`const img = document.querySelector('img.thumb'); return !img || (img.complete && img.naturalWidth > 0)`, 10000);
      await client.screenshot('firefox-youtube.png');
    }
    // Reaching YouTube depends on the network, so either result is fine as long as the build didn't refuse it.
    return shown;
  });

  await results.step('downloads a video into Movies/ClipSave', async () => {
    await client.run(find(server.clip));
    await client.until(`return !!document.querySelector('.option')`, 60000);
    await client.run(`document.querySelector('.option').click();`);
    await client.until(`return !!document.querySelector('.item.done')`, 60000);
    await client.screenshot('firefox-done.png');
    const { video } = savedFiles(home);
    if (video.length !== 1) throw new Error(`saved: ${video.join(', ') || 'nothing'}`);
    return video[0];
  });

  await results.step('saves MP3 audio', async () => {
    await client.run(`document.querySelector('#tab-save').click();`);
    await client.run(`const lists = document.querySelectorAll('#save-body .options'); lists[lists.length - 1].querySelector('.option').click();`);
    await client.until(`return document.querySelectorAll('.item.done').length === 2`, 60000);
    const { audio } = savedFiles(home);
    if (!audio.some((f) => f.endsWith('.mp3'))) throw new Error(`saved: ${audio.join(', ') || 'nothing'}`);
    return audio.join(', ');
  });

  await results.step('clear finished empties the list', async () => {
    await client.run(`document.querySelector('.text-button').click();`);
    await client.until(`return document.querySelector('#panel-downloads').innerText.includes('Videos you save')`, 5000);
  });

  await results.step('helper exits after 30 idle seconds', async () => {
    await sleep(35000);
    if (helperRunning(`clipsave-helper.*${home}`)) throw new Error('still running');
  });
  await close();

  const missing = await launch({ withHelper: false });
  await results.step('shows the install screen when the helper is missing', async () => {
    await missing.client.until(`return document.querySelector('#save-body').innerText.includes('One more step')`, 15000);
  });
  await missing.close();
} finally {
  server.close();
  cleanUp();
}

results.finish('Firefox');
