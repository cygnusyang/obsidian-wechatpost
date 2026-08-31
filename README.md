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
mkdir -p "<your-vault>/.obsidian/plugins/obsidian-wechatpost"
cp main.js manifest.json "<your-vault>/.obsidian/plugins/obsidian-wechatpost/"
```

Then in Obsidian: **Settings → Community plugins → Turn off safe mode → Enable "WeChatPost Publisher"**.

## Usage

- **Ribbon icon (⇧ arrow)** or **Command palette → "Publish current note to WeChat"**:
  reads the active note, publishes it directly (or saves as draft per your settings).
- **"Save current note as WeChat draft"**: publishes with `publish: false`.
- **"Preview current note (WeChat layout)"**: renders the note to themed HTML.
- **"Log in / Log out"**: manage the QR-code browser session.
- **Settings tab**: set the server path, default author, collection, publish-or-draft, theme, font, colors.

On first publish, the plugin spawns Chromium and shows a notice asking you to scan the QR code
in the opened window. Subsequent publishes reuse the saved session (`~/.wechatpost/playwright-user-data`).

## Configuration

Set `serverPath` to the absolute path of `wechatpost-mcp/dist/index.js`. The default points at the
repo checkout; you can change it in the plugin's Settings tab.

## Reusing the engine verbatim

`wechatpost-mcp` is a dependency, not a fork. The plugin never edits `PlaywrightService` or
`createDraftInBrowser`. It only calls the MCP tools the server already exposes:
`wechat_status`, `wechat_login`, `wechat_logout`, `wechat_configure`, `wechat_publish`, `wechat_preview`.

## License

MIT
