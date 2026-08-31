# Obsidian WeChat Publisher Plugin — Implementation Plan

## Goal
Turn the existing `wechatpost`/`wechatpost-mcp` engine into an Obsidian plugin so the user can
click a button/ribbon icon inside Obsidian to publish the current note (or a selected note)
as a WeChat Official Account article, with the same login, QR, and publishing behavior they
already have in VS Code / MCP.

## Key insight (why this architecture)
The `wechatpost-mcp` `PlaywrightService` (3,386 lines) is **already 100% decoupled from VS Code**
— it uses a `Logger` interface + JSON `ConfigStore` and reuses the same
`~/.wechatpost/playwright-user-data` browser profile + cached Chromium. It is the battle-tested
engine and should be **reused verbatim**, exactly as demanded by the instincts.

Obsidian plugins run in Electron's main process (Node available, `child_process` works) but
**cannot safely bundle Playwright + Mermaid** with esbuild (`require.resolve('mermaid/...')` breaks,
and a heavy in-process browser inside the editor is fragile). So the plugin is a **thin MCP client**
that spawns the existing `wechatpost-mcp` server as a child process and drives it over stdio JSON-RPC.

## Architecture
```
┌─────────────────────────────────────────────────────────┐
│ Obsidian plugin (main.ts, bundled to main.js)            │
│  - Ribbon icon + command "Publish current note to WeChat"│
│  - Settings: author, publish|draft, collection, style    │
│  - Spawns & manages wechatpost-mcp server lifecycle      │
│  - Calls MCP tools: publish / preview / login / logout   │
│            │ stdio JSON-RPC (MCP)                        │
└────────────┼──────────────────────────────────────────────┘
             ▼
┌─────────────────────────────────────────────────────────┐
│ wechatpost-mcp (UNMODIFIED — existing engine)           │
│  - PlaywrightService.createDraftInBrowser()             │
│  - QR login / saved session restore / browser close     │
│  - Chromium from ~/Library/Caches/ms-playwright         │
└─────────────────────────────────────────────────────────┘
```

## Files to create (new plugin repo: /Users/cygnus/work/github/obsidian-wechatpost/)
- `manifest.json` — Obsidian plugin manifest (id, name, version, minAppVersion, isDesktopOnly:true)
- `package.json` — deps: `@modelcontextprotocol/sdk`, `obsidian`, `typescript`, `esbuild`, `@types/node`
- `tsconfig.json`
- `esbuild.config.mjs` — bundle `main.ts` → `main.js`, externalize node built-ins + mermaid/playwright
- `src/main.ts` — Plugin class: register commands/ribbon, load settings, manage MCP client lifecycle
- `src/mcpClient.ts` — wraps `@modelcontextprotocol/sdk` StdioClientTransport; spawns server; call/status
- `src/settings.ts` — `DEFAULT_SETTINGS`, load/save via `plugin.saveData`; SettingsTab UI
- `src/serverLocator.ts` — resolve path to `wechatpost-mcp/dist/index.js` (configurable, with default to repo path)
- `README.md`, `LICENSE`, `.gitignore`

## wechatpost-mcp additions (minimal, non-invasive)
- No changes to `PlaywrightService`. The server already exposes `wechat_publish`, `wechat_preview`,
  `wechat_login`, `wechat_logout`, `wechat_status`, `wechat_configure`.
- (Optional, if needed) a tiny `dist` prebuild script is already present.

## Plugin behavior
1. **Login/Status**: on first publish, plugin calls `ensureLoggedIn` (via `wechat_status` then
   `wechat_login`). If QR needed, spawns Chromium window and shows a Notice "Scan QR in the opened
   Chrome window." Passing actual `createDraftInBrowser` requires a visible browser, so QR works.
2. **Publish**: reads the active Markdown note (or selected note), calls
   `wechat_publish { content, sourceFilePath, title, author, publish, ...style }`.
   Result (published/draft URL) shown in a Notice + logged to console.
3. **Preview**: calls `wechat_preview`, writes HTML to /tmp, opens it in an Obsidian webview
   (or a markdown preview) so user can check layout before publishing.
4. **Configure**: a Settings tab mapping to `wechat_configure` so the user sets author / draft-or-publish /
   collection / theme / colors once.

## Build & run
- `npm install`, then `npm run build` (esbuild) → `main.js`; copy into an Obsidian vault's
  `.obsidian/plugins/obsidian-wechatpost/`.
- Desktop-only (requires spawning an external Chromium); `isDesktopOnly: true`.
- Requires Node + the cached Playwright Chromium (already present) and `wechatpost-mcp` deps installed.

## Risks / mitigation
- **MCP server not installed on the target machine** → `serverLocator` falls back to a configurable
  absolute path; plugin surfaces a clear Notice. Optional `npx playwright install` hint.
- **esbuild bundling the MCP SDK** → SDK uses Node built-ins; esbuild config externalizes
  `node:*,child_process,fs,path,os,stream` (standard sample-plugin setup). Keep the SDK client only,
  not the server.
- **Verified service untouched** → no edits to `createDraftInBrowser`; the plugin is purely additive.

## Out of scope (phase 2)
- Publishing a folder/backlinks/embed resolution beyond what the engine already handles.
- MCP server auto-install; user installs `wechatpost-mcp` (or points to an existing copy).
