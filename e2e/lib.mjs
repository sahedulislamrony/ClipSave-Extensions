// Shared pieces of the browser tests: a local video server, throwaway folders, and results.
import { execSync } from 'node:child_process';
import { createReadStream, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..');
export const HELPER = process.env.CLIPSAVE_HELPER ?? join(ROOT, 'helper/target/release/clipsave-helper');
export const SCREENSHOTS = join(ROOT, 'e2e/screenshots');
export const HOST_NAME = 'link.clipsave.helper';
export const CHROME_ID = 'engejhilbedikenhabjndbpgpdhaedge';
export const FIREFOX_ID = 'clipsave@clipsave.link';
const CLIP = join(ROOT, 'e2e/fixtures/clip.mp4');

mkdirSync(SCREENSHOTS, { recursive: true });

/**
 * Serves the test clip at /clip.mp4, and at /slow.mp4 slowly enough to cancel mid-download.
 * yt-dlp reads both with its generic extractor, so no site or network is involved.
 */
export async function startServer() {
  const size = statSync(CLIP).size;
  const server = createServer((request, response) => {
    const slow = request.url.startsWith('/slow');
    if (!request.url.startsWith('/clip.mp4') && !slow) {
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
  return { clip: `${base}/clip.mp4`, slow: `${base}/slow.mp4`, close: () => server.close() };
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
  writeFileSync(
    join(dir, `${HOST_NAME}.json`),
    JSON.stringify({ name: HOST_NAME, description: 'ClipSave Helper (test)', path: HELPER, type: 'stdio', ...allowed }),
  );
}

export function list(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** The folders the helper saves into, for a given home folder. Matches helper/src/download.rs. */
export function savedFiles(home) {
  const linux = process.platform === 'linux';
  return {
    video: list(join(home, linux ? 'Videos' : 'Movies', 'ClipSave')).concat(linux ? list(join(home, 'Movies/ClipSave')) : []),
    audio: list(join(home, 'Music/ClipSave')),
  };
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

/** Whether a helper started by a browser is still running. */
export function helperRunning(match) {
  try {
    return execSync(`pgrep -f ${JSON.stringify(match)}`).toString().trim() !== '';
  } catch {
    return false;
  }
}
