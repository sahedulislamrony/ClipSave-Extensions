# Third-party notices

ClipSave for browsers is licensed under the [GPL-3.0-or-later](LICENSE). It includes or distributes the
following third-party components, each under its own license. All are compatible with the GPL-3.0.

## In the browser extension

| Component | Version | License | Use |
|---|---|---|---|
| [Plus Jakarta Sans](https://github.com/tokotype/PlusJakartaSans) via [@fontsource/plus-jakarta-sans](https://fontsource.org/fonts/plus-jakarta-sans) | 5.3.0 | SIL Open Font License 1.1 | the popup's typeface |
| [WXT](https://wxt.dev) | 0.21.5 | MIT | build tool; a few lines of its runtime are bundled |

## In the ClipSave Helper binary

| Crate | Version | License |
|---|---|---|
| [serde](https://serde.rs), serde_core, serde_json | 1.0.229, 1.0.229, 1.0.154 | MIT OR Apache-2.0 |
| [dirs](https://github.com/dirs-dev/dirs-rs), dirs-sys | 6.0.0, 0.5.0 | MIT OR Apache-2.0 |
| [option-ext](https://github.com/soc/option-ext) | 0.2.0 | MPL-2.0 |
| [libc](https://github.com/rust-lang/libc) | 0.2.191 | MIT OR Apache-2.0 |
| [itoa](https://github.com/dtolnay/itoa) | 1.0.18 | MIT OR Apache-2.0 |
| [memchr](https://github.com/BurntSushi/memchr) | 2.8.3 | Unlicense OR MIT |
| [zmij](https://github.com/dtolnay/zmij) | 1.0.23 | MIT |

## Shipped with the helper (release archives)

| Component | License | Notes |
|---|---|---|
| [yt-dlp](https://github.com/yt-dlp/yt-dlp) | [Unlicense](https://github.com/yt-dlp/yt-dlp/blob/master/LICENSE) | the official release build, downloaded and checksum-verified by `helper/fetch-engine.sh`. It bundles Python and other libraries under their own licenses; see yt-dlp's [THIRD_PARTY_LICENSES.txt](https://github.com/yt-dlp/yt-dlp/blob/master/THIRD_PARTY_LICENSES.txt). |

## Used but not distributed

The helper uses [FFmpeg](https://ffmpeg.org) and [Deno](https://deno.com) when they're installed on your
computer. ClipSave doesn't include or distribute them.

Development tools (TypeScript, Vitest, web-ext, Puppeteer, the Rust toolchain) aren't distributed.
