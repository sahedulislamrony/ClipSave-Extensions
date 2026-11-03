import { defineConfig } from 'wxt';

/**
 * Fixes the extension ID of unpacked Chrome builds, so the helper can allow it by name.
 * The Chrome Web Store rejects a new upload that sets `key`, so store builds leave it out.
 */
const CHROME_DEV_KEY =
  'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAmyaJM5oLD7dFxebgP7qpXmBGm7xObzvZ57oASuRGtni8ZySkcuE6ajgR660S3+/QK4tHERjUCM36LEhDYuniJkPH/QUXOtkNDCIEivD0DTNz4IlHg7L8x3ei66IHTnpTk+Lqh8Udws4c98dPesEv07dFF/r9AHJrQiVv1sVas4j26EBFicYRrqJuwj6vecTXr8FMmnOrvlHh7juTqUY4wWi+d0puMAXmaDpfu/l7C1ng+MPGMisbcDz94PxDTPlDiQA8If8PDOmmCAH5LRdU4BuSDRRtzF4RvTXYGzkLt4/s062ZNmH8dHgGCs160ckYpyeUYHkKqHub+O2R7yuReQIDAQAB';

export default defineConfig({
  srcDir: 'src',
  zip: {
    artifactTemplate: 'ClipSave-{{version}}-{{browser}}.zip',
    sourcesTemplate: 'ClipSave-{{version}}-sources.zip',
    // AMO reviewers get a source zip. The signing key must never end up in it.
    excludeSources: ['keys/**', 'helper/**', 'dist/**', 'e2e/screenshots/**', '.impeccable/**'],
  },
  manifest: ({ browser, mode }) => ({
    name: 'ClipSave',
    description:
      browser === 'firefox'
        ? 'Save videos and audio from 1000+ sites to your computer. Free, open source and private.'
        : 'Save videos and audio from supported sites to your computer. Free, open source and private. YouTube is not supported.',
    homepage_url: 'https://clipsave.link',
    permissions: ['nativeMessaging', 'activeTab', 'contextMenus', 'storage', 'notifications'],
    action: { default_title: 'ClipSave' },
    ...(browser === 'chrome' && mode !== 'store' ? { key: CHROME_DEV_KEY } : {}),
    ...(browser === 'firefox'
      ? {
          browser_specific_settings: {
            gecko: {
              id: 'clipsave@clipsave.link',
              strict_min_version: '142.0',
              data_collection_permissions: { required: ['none'] },
            },
          },
        }
      : {}),
  }),
});
