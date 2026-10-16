import { existsSync } from 'fs';

/**
 * Resolve the absolute path to the `wechatpost-mcp` server entrypoint
 * (`dist/index.js`). Prefers the user's configured path; falls back to the
 * conventional homedir install (`~/.wechatpost/...`). The plugin surfaces a
 * clear error if none is found.
 */
export function resolveServerPath(configured: string): string {
  if (configured && existsSync(configured)) {
    return configured;
  }

  const home = process.env.HOME;
  if (home) {
    const fallback = `${home}/.wechatpost/wechatpost-mcp/dist/index.js`;
    if (existsSync(fallback)) {
      return fallback;
    }
  }

  return configured;
}
