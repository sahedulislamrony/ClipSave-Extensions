#!/usr/bin/env node
// The extension and the helper share one version. It lives in package.json and helper/Cargo.toml
// (plus Cargo.lock), and this keeps them equal.
//
//   node scripts/version.mjs          prints the version, fails if the files disagree
//   node scripts/version.mjs 1.2.0    sets it everywhere
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const files = {
  package: resolve(root, 'package.json'),
  lock: resolve(root, 'package-lock.json'),
  cargo: resolve(root, 'helper/Cargo.toml'),
  cargoLock: resolve(root, 'helper/Cargo.lock'),
};
const CARGO_VERSION = /^(version\s*=\s*")([^"]+)(")/m;
const CARGO_LOCK_VERSION = /(name = "clipsave-helper"\nversion = ")([^"]+)(")/;
const SEMVER = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const read = (path) => readFileSync(path, 'utf8');

function current() {
  return {
    'package.json': JSON.parse(read(files.package)).version,
    'helper/Cargo.toml': CARGO_VERSION.exec(read(files.cargo))?.[2],
    'helper/Cargo.lock': CARGO_LOCK_VERSION.exec(read(files.cargoLock))?.[2],
  };
}

const wanted = process.argv[2];
if (wanted) {
  if (!SEMVER.test(wanted)) {
    console.error(`"${wanted}" isn't a version like 1.2.0`);
    process.exit(1);
  }
  const pkg = JSON.parse(read(files.package));
  pkg.version = wanted;
  writeFileSync(files.package, `${JSON.stringify(pkg, null, 2)}\n`);
  const lock = JSON.parse(read(files.lock));
  lock.version = wanted;
  if (lock.packages?.['']) lock.packages[''].version = wanted;
  writeFileSync(files.lock, `${JSON.stringify(lock, null, 2)}\n`);
  writeFileSync(files.cargo, read(files.cargo).replace(CARGO_VERSION, `$1${wanted}$3`));
  writeFileSync(files.cargoLock, read(files.cargoLock).replace(CARGO_LOCK_VERSION, `$1${wanted}$3`));
}

const versions = current();
const distinct = new Set(Object.values(versions));
if (distinct.size !== 1 || distinct.has(undefined)) {
  for (const [file, version] of Object.entries(versions)) console.error(`${file}: ${version ?? 'not found'}`);
  console.error('The versions differ. Set them together with: node scripts/version.mjs <version>');
  process.exit(1);
}
console.log([...distinct][0]);
