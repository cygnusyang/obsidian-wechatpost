/**
 * Note frontmatter reading + collection resolution.
 *
 * Obsidian stores note metadata (笔记属性) in a leading YAML block. The plugin
 * bundles to a single file, so we deliberately avoid a YAML dependency and only
 * read the flat shapes the article notes actually use:
 *
 *   key: value
 *   key: "value"
 *   key: "a long value that YAML folded across
 *        two source lines"
 *   key: [a, b, c]        (kept as-is; arrays are not used by the collection chain)
 *
 * Everything else (nested maps, block scalars) is out of scope on purpose —
 * silently half-parsing YAML is worse than not parsing it.
 */

const FRONTMATTER_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** Non-ASCII spaces that show up when text is pasted from WeChat / Word. */
const EXOTIC_SPACES_RE = /[\u3000\u00a0\u2000-\u200a\u202f\u205f]/g;

/** Frontmatter keys accepted as the WeChat 合集 name, in priority order. */
export const COLLECTION_ALIASES = ['catalog', 'collection'] as const;

export interface CollectionResolution {
  /** Collection name to hand to the engine; undefined means "skip Step 20". */
  collection?: string;
  /** Where the value came from — surfaced to the user so nothing is implicit. */
  source: 'frontmatter' | 'default' | 'none';
  /** The frontmatter key that matched, when `source` is `frontmatter`. */
  field?: string;
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

function isClosedQuote(value: string, quote: string): boolean {
  return value.length >= 2 && value.endsWith(quote);
}

/**
 * Parse the leading frontmatter block into a flat `key -> value` map.
 * Returns an empty object when the note has no frontmatter.
 */
export function parseFrontmatter(markdown: string): Record<string, string> {
  const match = markdown.match(FRONTMATTER_RE);
  if (!match) {
    return {};
  }

  const lines = match[1].split(/\r?\n/);
  const fields: Record<string, string> = {};

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf(':');
    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)) {
      continue;
    }

    let value = line.slice(separator + 1).trim();

    // Fold a quoted value that wraps onto following lines. The article notes
    // rely on this for their long `description` fields.
    const opener = value[0];
    if ((opener === '"' || opener === "'") && !isClosedQuote(value, opener)) {
      const parts = [value];
      while (i + 1 < lines.length) {
        i += 1;
        parts.push(lines[i].trim());
        value = parts.join(' ');
        if (isClosedQuote(value, opener)) {
          break;
        }
      }
    }

    fields[key] = unquote(value);
  }

  return fields;
}

/** Trim a collection name and normalise exotic spaces to plain ASCII spaces. */
export function normalizeCollectionName(value: string): string {
  return value.replace(EXOTIC_SPACES_RE, ' ').trim();
}

/**
 * Resolve the WeChat 合集 for a note.
 *
 * Priority: frontmatter[configuredProperty] -> frontmatter[aliases] -> fallback.
 *
 * `category` is intentionally NOT in the chain: it holds a topic class
 * ("易用性设计"), not a collection name ("Usability 易用性设计系列"). Falling back
 * to it would look like a success while attaching nothing.
 */
export function resolveCollection(
  fields: Record<string, string>,
  configuredProperty: string,
  fallback: string
): CollectionResolution {
  const keys: string[] = [];
  const configured = (configuredProperty || '').trim();
  if (configured) {
    keys.push(configured);
  }
  for (const alias of COLLECTION_ALIASES) {
    if (!keys.includes(alias)) {
      keys.push(alias);
    }
  }

  for (const key of keys) {
    const raw = fields[key];
    if (raw === undefined) {
      continue;
    }
    const value = normalizeCollectionName(raw);
    if (value) {
      return { collection: value, source: 'frontmatter', field: key };
    }
  }

  const apiDefault = normalizeCollectionName(fallback);
  if (apiDefault) {
    return { collection: apiDefault, source: 'default' };
  }
  return { source: 'none' };
}

/** Human-readable one-liner describing where the collection came from. */
export function describeCollection(resolution: CollectionResolution): string {
  if (!resolution.collection) {
    return '合集：（未指定）';
  }
  const origin =
    resolution.source === 'frontmatter'
      ? `frontmatter.${resolution.field}`
      : '插件默认值';
  return `合集：${resolution.collection}（来自 ${origin}）`;
}
