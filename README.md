# Obsidian WeChatPost Publisher

A thin Obsidian plugin that publishes the current Markdown note directly to a WeChat
Official Account (公众号) — click a button, scan a QR once, done.

## How it works

This plugin is **not** its own browser-automation engine. It reuses the existing
[`wechatpost-mcp`](../wechatpost-mcp) server verbatim as a child process and talks to it
over the Model Context Protocol (stdio JSON-RPC). The MCP server owns all the battle-tested
logic: launching Chromium, QR-code login, cookie persistence, Markdown → themed HTML, and
driving the WeChat editor (title → author → body → digest → AI cover → original → appreciation →
collection → publish).

```
Obsidian (this plugin)                     wechatpost-mcp (UNCHANGED)
┌──────────────────────────────┐          ┌──────────────────────────────┐
│ ribbon icon / command        │ spawn     │ PlaywrightService            │
│  ↓ wechat_publish(title,…)   │ ───────► │  createDraftInBrowser()      │
│ WeChatMCPClient (stdio)      │ ◄─────── │  Chromium + QR login         │
│ Settings tab → configure     │  JSON-RPC │  ~/.wechatpost/…/profile    │
└──────────────────────────────┘          └──────────────────────────────┘
```

**Why this architecture:** Obsidian plugins run inside a sandboxed Electron renderer. Bundling
Playwright + Mermaid into the plugin via esbuild is fragile (it breaks `require.resolve('mermaid/…')`
and ships a heavy in-process browser). Keeping the engine as an external process — and only
bundling the ~600KB MCP *client* — is the robust, maintainable choice. It also means **zero
changes** to the verified engine.

## Install & build

Prerequisites: Obsidian desktop, Node.js (v18+), and the `wechatpost-mcp` engine built & installed.

```bash
# 1) Build the engine (once)
cd ../wechatpost-mcp
npm install
npm run build            # → dist/index.js
npx playwright install chromium

# 2) Build & install this plugin
cd ../obsidian-wechatpost
npm install
npm run build            # → main.js
mkdir -p "<your-vault>/.obsidian/plugins/wechatpost"
cp main.js manifest.json "<your-vault>/.obsidian/plugins/wechatpost/"
```

Then in Obsidian: **Settings → Community plugins → Turn off safe mode → Enable "WeChatPost Publisher"**.

## Install via BRAT (recommended for updates)

1. Install the **BRAT** plugin (`obsidian42-brat`) from the community store.
2. BRAT Settings → **Add Beta plugin** → enter:
   ```
   https://github.com/cygnusyang/obsidian-wechatpost
   ```
3. Enable **WeChatPost Publisher** in **Settings → Community plugins**.
4. BRAT will auto-update the plugin when a new GitHub release is tagged.

> **Prerequisite — the engine.** This plugin is a thin client for the `wechatpost-mcp`
> engine (browser automation). Before first publish, build the engine once on your machine:
> ```bash
> cd wechatpost-mcp
> npm install && npm run build      # → dist/index.js
> npx playwright install chromium
> ```
> Then point the plugin's Settings → **server path** at that `dist/index.js`.

## Usage

- **Ribbon icon (⇧ arrow)** or **Command palette → "Publish current note to WeChat"**:
  reads the active note, publishes it directly (or saves as draft per your settings).
- **"Save current note as WeChat draft"**: publishes with `publish: false`.
- **"Show companion deliverables for current note"**: read-only listing of `assets/` + `配套交付物/`
  entries for the active note. Publishes nothing.
- **"Preview current note (WeChat layout)"**: renders the note to themed HTML.
- **"Log in / Log out"**: manage the QR-code browser session.
- **Settings tab**: server path, author, collection, cover behaviour, publish-or-draft, theme, font, colors.

On first publish, the plugin spawns Chromium and shows a notice asking you to scan the QR code
in the opened window. Subsequent publishes reuse the saved session (`~/.wechatpost/playwright-user-data`).

## Collection (合集) resolution

The WeChat 合集 is read from the **note's properties**, not from a global constant, so each
article lands in its own series collection. Resolution order:

1. frontmatter `catalog` (configurable — Settings → *Collection property*)
2. frontmatter `collection` (always accepted as an alias)
3. Settings → *Default collection* (fallback only)
4. nothing → the collection step is skipped, and the notice says so

```yaml
---
title: "凭什么说这版更好用"
date: 2026-09-23
category: "易用性设计"          # topic class — NOT used as a collection name
catalog: "Usability 易用性设计系列"   # WeChat 合集 name — must match the backend exactly
description: "没有样本边界的好评不是证据……"
---
```

Notes:

- The name must match an existing collection in the WeChat backend **exactly**. The engine never
  silently attaches a different collection — a miss is reported, not guessed.
- `category` is deliberately excluded from the chain: it holds a topic class (`易用性设计`), not a
  collection name (`Usability 易用性设计系列`). Falling back to it would look like success while
  attaching nothing.
- If `description` is present it is used as the digest instead of the raw body opening.

## Local cover image

By default the plugin uploads the article's own cover (`assets/封面/NN-*.png`) instead of letting
the platform generate one. `NN` is the two-digit prefix of the note's file name — the same key used
by every companion artefact.

- A picker appears on publish. The **auto-matched cover is listed first and pre-selected**, so
  accepting it is a single Enter. Quote cards (`assets/金句卡/NN-*.png`) are offered as well.
- Nothing is chosen silently: dismissing the picker means "no local cover".
- Settings → *Fall back to AI cover* controls what happens then. On (default) uses the AI cover and
  says so; off aborts the publish, so a missing cover is never swapped behind your back.

> **Coverage note.** Only **101 of 279** in-use articles have an `assets/封面/` image today
> (36%). The rest still fall back to the AI cover.

## Companion deliverables

`Show companion deliverables for current note` lists what exists for the active note, without
publishing anything. Files are matched strictly by the two-digit prefix:

| Path | Route |
|---|---|
| `assets/封面/NN-*.png` | Article cover |
| `assets/金句卡/NN-*.png` | Image library (use pending — see the spec §5.1) |
| `assets/png/NN-*.png` | Inline body images (already handled by the engine) |
| `配套交付物/NN-*.md` / `.xlsx` | **Not transferable** — WeChat has no file attachments |

Templates cannot be uploaded; they travel as a KDocs link through a keyword auto-reply. The publish
receipt says so explicitly rather than implying a sync that never happened. It also reports missing
directories and zero matches — nothing is skipped quietly.

## Spec document

[`docs/01-功能规格-合集封面与配套交付物同步.md`](docs/01-功能规格-合集封面与配套交付物同步.md)
is the formal record of the three features above: evidence for each claim (with file/line
references), the data contracts, the MCP protocol extension, the plugin/engine responsibility split,
the platform constraints, and a verification checklist.

Two things it records that are easy to get wrong:

- The browser-driving half of the cover and deliverable features lives in `wechatpost-mcp`, **not**
  in this plugin. "Add it to the plugin" is only half of those two features.
- The cover-picker DOM is the one unverified piece. `wechatpost-mcp/probe_cover.mjs` collects the
  evidence in a single real run (draft only, never a mass send).

## Configuration

Set `serverPath` to the absolute path of `wechatpost-mcp/dist/index.js`. The default points at the
repo checkout; you can change it in the plugin's Settings tab.

## Reusing the engine verbatim

`wechatpost-mcp` is a dependency, not a fork. The plugin never edits `PlaywrightService` or
`createDraftInBrowser`. It only calls the MCP tools the server already exposes:
`wechat_status`, `wechat_login`, `wechat_logout`, `wechat_configure`, `wechat_publish`, `wechat_preview`.

## License

MIT
