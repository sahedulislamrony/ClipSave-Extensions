// Shared pieces of the browser tests: a local video server, throwaway folders, and results.
import { execFileSync } from 'node:child_process';
import { createReadStream, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const IS_WINDOWS = process.platform === 'win32';
export const ROOT = resolve(import.meta.dirname, '..');
export const HELPER =
  process.env.CLIPSAVE_HELPER ?? join(ROOT, 'helper/target/release', IS_WINDOWS ? 'clipsave-helper.exe' : 'clipsave-helper');
export const SCREENSHOTS = join(ROOT, 'e2e/screenshots');
export const HOST_NAME = 'link.clipsave.helper';
export const CHROME_ID = 'engejhilbedikenhabjndbpgpdhaedge';
export const FIREFOX_ID = 'clipsave@clipsave.link';
const CLIP = join(ROOT, 'e2e/fixtures/clip.mp4');

mkdirSync(SCREENSHOTS, { recursive: true });

/**
 * Serves the test clip at /clipsave-e2e.mp4, and at /slow.mp4 slowly enough to cancel mid-download. yt-dlp
 * names the clip after the address, so its files are easy to tell from anything else in the folders.
 * yt-dlp reads both with its generic extractor, so no site or network is involved.
 */
export async function startServer() {
  const size = statSync(CLIP).size;
  const server = createServer((request, response) => {
    const slow = request.url.startsWith('/slow');
    if (!request.url.startsWith('/clipsave-e2e.mp4') && !slow) {
      response.writeHead(404).end();
      return;
    }
    const range = /bytes=(\d+)-(\d*)/.exec(request.headers.range ?? '');
    const start = range ? Number(range[1]) : 0;
    const end = range && range[2] ? Number(range[2]) : size - 1;
    response.writeHead(range ? 206 : 200, {
      'Content-Type': 'video/mp4',
      'Content-Length': end - start + 1,
      'Accept-Ranges': 'bytes',
      ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}),
    });
    if (request.method === 'HEAD') return response.end();
    const stream = createReadStream(CLIP, { start, end, highWaterMark: slow ? 1024 : 65536 });
    if (!slow) return stream.pipe(response);
    // About 5 KB a second: the 46 KB clip takes long enough to cancel.
    stream.on('data', (chunk) => {
      stream.pause();
      response.write(chunk);
      setTimeout(() => stream.resume(), 200);
    });
    stream.on('end', () => response.end());
    request.on('close', () => stream.destroy());
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { clip: `${base}/clipsave-e2e.mp4`, slow: `${base}/slow.mp4`, close: () => server.close() };
}

const made = [];

/** A folder that is deleted when the run ends. */
export function scratch(prefix) {
  const dir = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), `clipsave-e2e-${prefix}-`));
  made.push(dir);
  return dir;
}

export function cleanUp() {
  for (const dir of made) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // Browsers sometimes lock their profile folders for a moment; the system temp folder is cleared anyway.
    }
  }
}

export function writeHostManifest(dir, allowed) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${HOST_NAME}.json`);
  writeFileSync(
    file,
    JSON.stringify({ name: HOST_NAME, description: 'ClipSave Helper (test)', path: HELPER, type: 'stdio', ...allowed }),
  );
  return file;
}

/**
 * Windows browsers find native hosts only through the registry, under HKEY_CURRENT_USER\<key>. Points that
 * entry at `file` (or removes it when `file` is null) and returns a function that puts back what was there,
 * so a developer's own installed helper survives a test run. Does nothing elsewhere.
 */
export function registryEntry(key, file) {
  if (!IS_WINDOWS) return () => {};
  const path = `HKCU\\${key}\\${HOST_NAME}`;
  const reg = (...args) => execFileSync('reg', args, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  let previous = null;
  try {
    previous = /REG_SZ\s+(.+)/.exec(reg('query', path, '/ve'))?.[1]?.trim() ?? null;
  } catch {
    // No entry yet.
  }
  const set = (value) => {
    if (value) reg('add', path, '/ve', '/t', 'REG_SZ', '/d', value, '/f');
    else {
      try {
        reg('delete', path, '/f');
      } catch {
        // Already gone.
      }
    }
  };
  set(file);
  return () => set(previous);
}

export const CHROME_REGISTRY_KEY = 'Software\\Google\\Chrome\\NativeMessagingHosts';
export const FIREFOX_REGISTRY_KEY = 'Software\\Mozilla\\NativeMessagingHosts';

export function list(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/**
 * The folders the helper saves into, for a given home folder. Matches helper/src/download.rs. Windows asks the
 * system for the user's Videos and Music folders rather than reading HOME, so there the real ones are used.
 */
function saveFolders(home) {
  if (IS_WINDOWS) return { video: [join(homedir(), 'Videos/ClipSave')], audio: [join(homedir(), 'Music/ClipSave')] };
  const linux = process.platform === 'linux';
  return {
    video: linux ? [join(home, 'Videos/ClipSave'), join(home, 'Movies/ClipSave')] : [join(home, 'Movies/ClipSave')],
    audio: [join(home, 'Music/ClipSave')],
  };
}

/** "clipsave-e2e.mp4", "clipsave-e2e (2).mp3", "clipsave-e2e [clipsave-e2e].mp3": the popup names files by title. */
const isTestClip = (name) => name.startsWith('clipsave-e2e');

/** The test clip's files the helper saved: only those, so other files in the folders don't count. */
export function savedFiles(home) {
  const folders = saveFolders(home);
  const clips = (dirs) => dirs.flatMap(list).filter(isTestClip);
  return { video: clips(folders.video), audio: clips(folders.audio) };
}

/** Removes the test clip's files from the real Videos and Music folders on Windows. */
export function removeSavedFiles(home) {
  if (!IS_WINDOWS) return;
  const folders = saveFolders(home);
  for (const dir of [...folders.video, ...folders.audio]) {
    for (const name of list(dir).filter(isTestClip)) rmSync(join(dir, name), { force: true });
  }
}

export class Results {
  passed = 0;
  failed = [];

  check(name, ok, detail = '') {
    if (ok) this.passed++;
    else this.failed.push(name);
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  }

  /** Runs a step; a thrown error counts as a failure instead of ending the run. */
  async step(name, run) {
    try {
      const detail = await run();
      this.check(name, true, typeof detail === 'string' ? detail : '');
    } catch (error) {
      this.check(name, false, error instanceof Error ? error.message.split('\n')[0] : String(error));
    }
  }

  finish(label) {
    const total = this.passed + this.failed.length;
    console.log(`\n${label}: ${this.passed}/${total} passed`);
    if (this.failed.length) process.exitCode = 1;
  }
}

export const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Whether a helper whose command line contains `match` is still running. */
export function helperRunning(match) {
  const lines = IS_WINDOWS
    ? execFileSync('powershell', [
        '-NoProfile',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='clipsave-helper.exe'\" | ForEach-Object { $_.CommandLine }",
      ]).toString()
    : execFileSync('ps', ['-A', '-o', 'args=']).toString();
  return lines.split('\n').some((line) => line.includes('clipsave-helper') && line.includes(match));
}
