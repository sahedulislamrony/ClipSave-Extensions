#!/usr/bin/env node
// Pins the ffmpeg and ffprobe builds that releases ship: writes their exact download links and SHA-256s
// to helper/engine.lock, which helper/fetch-engine.sh then insists on. Run it by hand to move to newer
// builds, and review the diff before committing it:
//
//   node scripts/pin-engines.mjs
//
// The checksums come from the build servers once, here, when you choose to trust a build. After that a
// release build can't pick up a different file, even if the server starts serving one.
//
// The Windows builds come from dated yt-dlp/FFmpeg-Builds releases, which are deleted after a few weeks.
// When the pinned one is gone, fetch-engine.sh stops and asks for this script to be run again.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCK = join(dirname(fileURLToPath(import.meta.url)), '..', 'helper', 'engine.lock');
const RIEDL = 'https://ffmpeg.martin-riedl.de';
const BUILDS = 'yt-dlp/FFmpeg-Builds';
const HEADERS = { 'User-Agent': 'clipsave-pin-engines' };
const SHA256 = /^[0-9a-f]{64}$/;

async function get(url, options = {}) {
  const response = await fetch(url, { headers: HEADERS, ...options });
  if (!response.ok && !(options.redirect === 'manual' && response.status >= 300 && response.status < 400)) {
    throw new Error(`${url} answered ${response.status}`);
  }
  return response;
}

function checksum(text, name) {
  const line = text.split('\n').find((l) => l.trim().split(/\s+/)[1]?.replace(/^\*/, '') === name);
  const sum = (line ?? text).trim().split(/\s+/)[0].toLowerCase();
  if (!SHA256.test(sum)) throw new Error(`No SHA-256 for ${name}`);
  return sum;
}

/** macOS and Linux: the permanent link redirects to a versioned file, with its checksum beside it. */
async function riedl(os, arch, tool) {
  const platform = `${os}/${arch === 'x86_64' ? 'amd64' : 'arm64'}`;
  const redirect = await get(`${RIEDL}/redirect/latest/${platform}/release/${tool}.zip`, { redirect: 'manual' });
  const url = new URL(redirect.headers.get('location') ?? '', RIEDL).href;
  if (!url.startsWith(`${RIEDL}/download/${platform}/`)) throw new Error(`Unexpected ${tool} link: ${url}`);
  const sum = checksum(await (await get(`${url}.sha256`)).text(), `${tool}.zip`);
  return { name: `${tool}-${os}-${arch}`, url, sum };
}

/** Windows: the newest dated release, never the moving "latest" one. */
async function windows(releases, arch) {
  const kind = arch === 'x86_64' ? 'win64' : 'winarm64';
  const release = releases.find((r) => r.tag_name?.startsWith('autobuild-'));
  if (!release) throw new Error('No dated FFmpeg-Builds release found');
  const zip = release.assets.find((a) => a.name.startsWith('ffmpeg-N-') && a.name.endsWith(`-${kind}-gpl-shared.zip`));
  const sums = release.assets.find((a) => a.name === 'checksums.sha256');
  if (!zip || !sums) throw new Error(`${release.tag_name} has no ${kind} build or checksums`);
  const prefix = `https://github.com/${BUILDS}/releases/download/${release.tag_name}/`;
  if (!zip.browser_download_url.startsWith(prefix)) throw new Error(`Unexpected link: ${zip.browser_download_url}`);
  const sum = checksum(await (await get(sums.browser_download_url)).text(), zip.name);
  return { name: `ffmpeg-windows-${arch}`, url: zip.browser_download_url, sum };
}

const pins = [];
for (const [os, arch] of [['macos', 'arm64'], ['macos', 'x86_64'], ['linux', 'x86_64'], ['linux', 'arm64']]) {
  for (const tool of ['ffmpeg', 'ffprobe']) pins.push(await riedl(os, arch, tool));
}
// Both Windows builds from the same dated release.
const releases = await (await get(`https://api.github.com/repos/${BUILDS}/releases?per_page=20`)).json();
for (const arch of ['x86_64', 'arm64']) pins.push(await windows(releases, arch));

const width = Math.max(...pins.map((p) => p.name.length));
writeFileSync(
  LOCK,
  [
    '# The ffmpeg builds releases ship, and their SHA-256s. helper/fetch-engine.sh accepts nothing else.',
    '# Written by `node scripts/pin-engines.mjs`; run it again to move to newer builds.',
    '# name  url  sha256',
    ...pins.map((p) => `${p.name.padEnd(width)}  ${p.url}  ${p.sum}`),
    '',
  ].join('\n'),
);
for (const p of pins) console.log(`${p.name}  ${p.url}`);
console.log(`Wrote ${LOCK}`);
