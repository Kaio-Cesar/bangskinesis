<p align="center">
  <img src="public/icon/128.png" width="80" height="80" alt="" />
</p>

<h1 align="center">BangsKinesis</h1>

<p align="center">
  DuckDuckGo-style <code>!bangs</code> in Chrome and Firefox, <b>without</b> changing your search engine.
</p>

---

Type `!w black holes` in the address bar and go straight to Wikipedia. Type `!gh bun` and go to GitHub's
search. Keep Google, Bing, or whatever you already use as your default; BangsKinesis catches the search
before it reaches the engine and sends you to the right site instead.

It comes with **10,000+ bangs** (13,000+ triggers) from the collection used by the
[Helium browser](https://helium.computer), derived from [Kagi's bangs](https://github.com/kagisearch/bangs).

## Features

- **Works with your existing search engine.** Google (every country domain), Bing, Brave Search, Ecosia,
  Yahoo, Startpage, Qwant and Yandex. DuckDuckGo and Kagi already have bangs, so they're left alone.
- **Fast.** Bangs are cached locally and looked up by trigger; the redirect happens before the search
  engine is ever contacted.
- **Bang first or last.** Both `!dev react` and `react !dev` work.
- **Keyword mode with a preview.** Type `!` then <kbd>Space</kbd> in the address bar: the browser shows a
  BangsKinesis chip and the suggestions show where you'll land (`DevDocs — search devdocs.io for react`).
- **Works offline from the first launch.** A copy of the collection ships with the extension and is
  refreshed in the background when the upstream file changes.
- **No tracking.** See [Privacy](#privacy).

## Install

Store listings aren't available yet. Until then, install from the
[latest release](../../releases/latest):

**Chrome / Edge / Brave / other Chromium browsers**

1. Download `bangskinesis-<version>-chrome.zip` and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**.
3. Click **Load unpacked** and pick the unzipped folder.

**Firefox** (128 or newer)

1. Download `bangskinesis-<version>-firefox.zip`.
2. Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on…**, and pick the zip.
   Temporary add-ons are removed when Firefox restarts; a signed build will follow.

## Usage

| You type in the address bar | You land on |
| --- | --- |
| `!dev array flat` | DevDocs search for "array flat" |
| `rust lifetimes !so` | Stack Overflow search |
| `!yt` | youtube.com (no search terms opens the site) |
| `!important css` (not a bang) | Your normal search engine, untouched |

Find any bang by searching the [Kagi bang list](https://github.com/kagisearch/bangs), or test
one in the extension's options page, which has a **Try a bang** box.

### Keyword mode

Type `!` and then <kbd>Space</kbd> (or <kbd>Tab</kbd>). Everything you type next goes to BangsKinesis:

- `dev` shows matching bangs while you type the trigger (`!dev DevDocs`, `!devto dev.to`, …).
- `dev react` shows a preview of the destination. Press <kbd>Enter</kbd> to go, or
  <kbd>Alt</kbd>+<kbd>Enter</kbd> to open it in a new tab.

> **Why not a pill like Helium?** Helium draws a site "pill" inside the address bar because it is
> the browser. Extensions can't change how the address bar renders text, so keyword mode is the
> closest an extension can get.

### Options

Right-click the extension icon → **Options** (Chrome) or open it from `about:addons` (Firefox) to:

- see how many bangs are cached and when they were last updated, and refresh them now;
- turn interception on or off per search engine;
- try out bangs.

## Privacy

BangsKinesis collects nothing and has no analytics.

- Your searches are processed locally. Bang lookups never leave your device.
- The only request it makes on its own is to download the bang list from
  `services.helium.imput.net`, about every 6 hours, and only re-downloads when the file changed.
- It needs access to the search engine domains so it can redirect bang searches there. It never
  reads page content.

## How it works

1. A `declarativeNetRequest` rule matches search URLs whose query starts or ends with a `!bang`
   and redirects them to a small page inside the extension, so the search engine is never contacted.
2. That page looks the bang up in a local IndexedDB cache, builds the destination URL and replaces
   itself, so it doesn't appear in your history.
3. If the bang doesn't exist, the search continues to your engine, with a marker (`bk=0`) so it
   isn't intercepted again.

## Development

Requires [Bun](https://bun.sh) 1.4+. Built with [WXT](https://wxt.dev).

```bash
bun install
bun run dev              # Chrome with hot reload
bun run dev:firefox      # Firefox with hot reload
```

| Command | What it does |
| --- | --- |
| `bun test` | Unit tests (parser, query, URL building, engine regexes) |
| `bun run compile` | Typecheck |
| `bun run build` / `build:firefox` | Production build into `.output/` |
| `bun run zip` / `zip:firefox` | Store-ready zips (Firefox also gets a sources zip for AMO) |
| `bun run e2e` | Loads the Chrome build into Playwright's Chromium and checks real redirects |
| `bun run e2e:firefox` | Same for Firefox, over WebDriver BiDi |

`bunfig.toml` refuses dependency versions published less than 7 days ago.

The project layout:

```
entrypoints/background.ts   install, refresh schedule, DNR rules, keyword mode
entrypoints/redirect/       the redirect page
entrypoints/options/        options page
lib/                        parsing, lookup, URL building, cache, engine rules
scripts/                    bang snapshot download, icon generator
tests/  e2e/                unit and end-to-end tests
```

CI builds, tests and packages every push. Pushing a `v*` tag that matches the `package.json`
version publishes a GitHub release with the Chrome, Firefox and sources zips.

## Credits

- Bang data: [Helium](https://github.com/imputnet/helium-services) by imput, based on
  [kagisearch/bangs](https://github.com/kagisearch/bangs), MIT licensed.
- Inspired by DuckDuckGo's bangs and Helium's native bang support.
