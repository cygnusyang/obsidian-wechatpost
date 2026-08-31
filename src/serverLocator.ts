import { existsSync } from 'fs';

/**
 * Resolve the absolute path to the `wechatpost-mcp` server entrypoint
 * (`dist/index.js`). Prefers the user's configured path; falls back to a
 * couple of conventional locations (the repo path and a homedir install).
 * The plugin surfaces a clear error if none is found.
 */
export function resolveServerPath(configured: string): string {
  if (configured && existsSync(configured)) {
    return configured;
  }

  const candidates = [
    '/Users/cygnus/work/github/wechatpost-mcp/dist/index.js',
    // macOS/Linux homedir install fallback
    `${process.env.HOME}/.wechatpost/wechatpost-mcp/dist/index.js`,
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return configured;
}
