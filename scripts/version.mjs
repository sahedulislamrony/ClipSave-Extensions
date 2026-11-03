#!/usr/bin/env node
// release.json says which version to release. Merging a change to it into main publishes that version, as
// long as it's newer than the last release and every check passes. The same version is kept in
// package.json and helper/Cargo.toml (plus their lock files), and this script keeps them all equal.
//
//   node scripts/version.mjs            prints the version, fails if the files disagree
//   node scripts/version.mjs 1.2.0      sets it in every file
//   node scripts/version.mjs --newer    fails unless it's newer than the latest v* git tag
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compare, isVersion, latest } from './semver.mjs';

const root = resolve(import.meta.dirname, '..');
const files = {
  release: resolve(root, 'release.json'),
  package: resolve(root, 'package.json'),
  lock: resolve(root, 'package-lock.json'),
  cargo: resolve(root, 'helper/Cargo.toml'),
  cargoLock: resolve(root, 'helper/Cargo.lock'),
};
const CARGO_VERSION = /^(version\s*=\s*")([^"]+)(")/m;
const CARGO_LOCK_VERSION = /(name = "clipsave-helper"\nversion = ")([^"]+)(")/;

const read = (path) => readFileSync(path, 'utf8');
const readJson = (path) => JSON.parse(read(path));
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

function current() {
  return {
    'release.json': readJson(files.release).version,
    'package.json': readJson(files.package).version,
    'helper/Cargo.toml': CARGO_VERSION.exec(read(files.cargo))?.[2],
    'helper/Cargo.lock': CARGO_LOCK_VERSION.exec(read(files.cargoLock))?.[2],
  };
}

function set(version) {
  writeJson(files.release, { ...readJson(files.release), version });
  writeJson(files.package, { ...readJson(files.package), version });
  const lock = readJson(files.lock);
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  writeJson(files.lock, lock);
  writeFileSync(files.cargo, read(files.cargo).replace(CARGO_VERSION, `$1${version}$3`));
  writeFileSync(files.cargoLock, read(files.cargoLock).replace(CARGO_LOCK_VERSION, `$1${version}$3`));
}

function agreed() {
  const versions = current();
  const distinct = new Set(Object.values(versions));
  if (distinct.size !== 1 || distinct.has(undefined)) {
    for (const [file, version] of Object.entries(versions)) console.error(`${file}: ${version ?? 'not found'}`);
    console.error('The versions differ. Set them together with: node scripts/version.mjs <version>');
    process.exit(1);
  }
  const [version] = distinct;
  if (!isVersion(version)) {
    console.error(`"${version}" isn't a version like 1.2.0`);
    process.exit(1);
  }
  return version;
}

const arg = process.argv[2];
if (arg === '--newer') {
  const version = agreed();
  const tags = execFileSync('git', ['tag', '--list', 'v*'], { cwd: root, encoding: 'utf8' }).split('\n');
  const last = latest(tags);
  if (last !== null && compare(version, last) <= 0) {
    console.error(`release.json says ${version}, which isn't newer than the latest release, v${last}.`);
    process.exit(1);
  }
  console.log(`${version} is newer than ${last ? `v${last}` : 'any release'}`);
} else if (arg) {
  if (!isVersion(arg)) {
    console.error(`"${arg}" isn't a version like 1.2.0`);
    process.exit(1);
  }
  set(arg);
  console.log(agreed());
} else {
  console.log(agreed());
}
