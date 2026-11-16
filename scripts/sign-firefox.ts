/**
 * Sign the Firefox build on AMO's *unlisted* channel (self-distribution) and
 * prepare the files for a GitHub release:
 *
 *   .output/bangskinesis-<version>-firefox.xpi   signed add-on
 *   .output/updates.json                         Firefox update manifest
 *
 * Expects `.output/firefox-mv3/` and `.output/bangskinesis-<version>-sources.zip`
 * (from `bun run zip:firefox`). Credentials come from addons.mozilla.org →
 * Developer Hub → Manage API Keys:
 *
 *   WEB_EXT_API_KEY=<JWT issuer> WEB_EXT_API_SECRET=<JWT secret> bun run sign:firefox
 */
import { createHash } from 'node:crypto';
import { readdir, rename, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import pkg from '../package.json';
import { GECKO_ID, REPO } from '../wxt.config';

const root = resolve(import.meta.dir, '..');
const out = join(root, '.output');
const sourceDir = join(out, 'firefox-mv3');
const sourcesZip = join(out, `bangskinesis-${pkg.version}-sources.zip`);
const signedDir = join(out, 'signed');
const xpiName = `bangskinesis-${pkg.version}-firefox.xpi`;

if (!process.env.WEB_EXT_API_KEY || !process.env.WEB_EXT_API_SECRET) {
  console.error('Set WEB_EXT_API_KEY and WEB_EXT_API_SECRET (AMO API credentials).');
  process.exit(1);
}
for (const p of [join(sourceDir, 'manifest.json'), sourcesZip]) {
  if (!(await Bun.file(p).exists())) {
    console.error(`Missing ${p}. Run \`bun run zip:firefox\` first.`);
    process.exit(1);
  }
}

await rm(signedDir, { recursive: true, force: true });
const webExt = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'web-ext.exe' : 'web-ext');
const proc = Bun.spawn(
  [
    webExt, 'sign',
    '--channel', 'unlisted',
    '--source-dir', sourceDir,
    '--artifacts-dir', signedDir,
    '--upload-source-code', sourcesZip,
    '--approval-timeout', String(30 * 60 * 1000),
  ],
  { stdout: 'inherit', stderr: 'inherit', env: process.env },
);
if ((await proc.exited) !== 0) process.exit(1);

const xpi = (await readdir(signedDir)).find((f) => f.endsWith('.xpi'));
if (!xpi) {
  console.error(`No signed .xpi found in ${signedDir}`);
  process.exit(1);
}
await rename(join(signedDir, xpi), join(out, xpiName));
const hash = createHash('sha256').update(await Bun.file(join(out, xpiName)).bytes()).digest('hex');

const updates = {
  addons: {
    [GECKO_ID]: {
      updates: [
        {
          version: pkg.version,
          update_link: `https://github.com/${REPO}/releases/download/v${pkg.version}/${xpiName}`,
          update_hash: `sha256:${hash}`,
        },
      ],
    },
  },
};
await Bun.write(join(out, 'updates.json'), JSON.stringify(updates, null, 2) + '\n');
console.log(`Signed: .output/${xpiName}\nUpdate manifest: .output/updates.json`);
