// Version comparison by the Semantic Versioning rules (semver.org, section 11), so 1.0.0-beta < 1.0.0.

const PATTERN = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function isVersion(text) {
  return PATTERN.test(text);
}

/** Negative when a < b, positive when a > b, zero when equal. Both must be versions like 1.2.0 or 1.2.0-beta.1. */
export function compare(a, b) {
  const [, ...pa] = PATTERN.exec(a) ?? fail(a);
  const [, ...pb] = PATTERN.exec(b) ?? fail(b);
  for (let i = 0; i < 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i]);
    if (diff) return Math.sign(diff);
  }
  const [preA, preB] = [pa[3], pb[3]];
  if (preA === preB) return 0;
  if (preA === undefined) return 1;
  if (preB === undefined) return -1;
  const idsA = preA.split('.');
  const idsB = preB.split('.');
  for (let i = 0; i < Math.max(idsA.length, idsB.length); i++) {
    const [x, y] = [idsA[i], idsB[i]];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const [nx, ny] = [/^\d+$/.test(x), /^\d+$/.test(y)];
    if (nx && ny && Number(x) !== Number(y)) return Math.sign(Number(x) - Number(y));
    if (nx !== ny) return nx ? -1 : 1;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** The highest of `tags` (like v1.2.0), or null. Tags that aren't versions are ignored. */
export function latest(tags) {
  return (
    tags
      .map((tag) => tag.replace(/^v/, ''))
      .filter(isVersion)
      .sort(compare)
      .at(-1) ?? null
  );
}

function fail(text) {
  throw new Error(`"${text}" isn't a version like 1.2.0`);
}
