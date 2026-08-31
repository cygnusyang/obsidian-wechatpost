/**
 * Extract the first H1 heading as the article title.
 * Mirrors the engine's `extractTitle` so the plugin and server agree.
 */
export function extractTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

/**
 * Resolve the article title: from the markdown H1, else from the source
 * filename, else a default. Mirrors the engine's fallback chain.
 */
export function resolveArticleTitle(markdown: string, filePath?: string): string {
  const fromMd = extractTitle(markdown);
  if (fromMd) {
    return fromMd;
  }
  if (filePath) {
    const base = filePath.split(/[\\/]/).pop() || '';
    if (base) {
      return base.replace(/\.md$/i, '');
    }
  }
  return 'Untitled';
}
