/**
 * Companion-deliverable discovery (配套交付物 / assets).
 *
 * Articles are named `NN-<title>-公众号版.md`; every companion artefact of that
 * article shares the same two-digit prefix:
 *
 *   <series>/assets/封面/NN-封面.png            → the article cover
 *   <series>/assets/金句卡/NN-金句卡-竖版.png    → quote card
 *   <series>/assets/png/NN-*.png                 → body illustrations
 *   <series>/配套交付物/NN-*.md | NN-*.xlsx      → templates
 *
 * The two-digit prefix is the ONLY join key. No fuzzy matching, no edit
 * distance: a wrong guess here silently attaches the wrong image to an article.
 */

import { closeSync, existsSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

export type DeliverableKind = 'cover' | 'quote-card' | 'illustration' | 'template';

/** Where a file can actually go. See docs §3.2 — the platform is not a drive. */
export type TransferRoute = 'cover' | 'image-library' | 'body-inline' | 'not-transferable';

export interface DeliverableFile {
  kind: DeliverableKind;
  /** Absolute path on disk. */
  path: string;
  /** File name, for display. */
  name: string;
  bytes: number;
  route: TransferRoute;
}

export interface DeliverableScan {
  /** Two-digit article prefix, or null when the file name does not carry one. */
  prefix: string | null;
  files: DeliverableFile[];
  /** Directories that were looked for but are absent — reported, never hidden. */
  missingDirs: string[];
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const TEMPLATE_EXTENSIONS = ['.md', '.xlsx', '.xls', '.csv', '.pdf'];

/** Extract the leading two-digit article number from a file name. */
export function extractArticlePrefix(fileName: string): string | null {
  const match = basename(fileName).match(/^(\d{2})-/);
  return match ? match[1] : null;
}

/**
 * Read pixel dimensions straight out of a PNG header (IHDR at byte 16).
 * Returns null for anything that is not a readable PNG — the picker then just
 * shows the file size instead of guessing dimensions.
 */
export function readPngSize(filePath: string): { width: number; height: number } | null {
  let fd: number | null = null;
  try {
    fd = openSync(filePath, 'r');
    const header = Buffer.alloc(24);
    if (readSync(fd, header, 0, 24, 0) < 24) {
      return null;
    }
    // PNG signature: 89 50 4E 47
    if (header.readUInt32BE(0) !== 0x89504e47) {
      return null;
    }
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      closeSync(fd);
    }
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function listByPrefix(
  dir: string,
  prefix: string,
  extensions: string[]
): Array<{ name: string; bytes: number }> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }

  const found: Array<{ name: string; bytes: number }> = [];
  for (const name of entries) {
    if (!name.startsWith(`${prefix}-`)) {
      continue;
    }
    if (extensions.length > 0 && !extensions.includes(extname(name).toLowerCase())) {
      continue;
    }
    try {
      const stats = statSync(join(dir, name));
      if (stats.isFile()) {
        found.push({ name, bytes: stats.size });
      }
    } catch {
      // Unreadable entry: skip rather than fail the whole scan.
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}

function collect(
  seriesDir: string,
  segments: string[],
  prefix: string,
  kind: DeliverableKind,
  route: TransferRoute,
  extensions: string[],
  missingDirs: string[]
): DeliverableFile[] {
  const dir = join(seriesDir, ...segments);
  if (!existsSync(dir)) {
    missingDirs.push(segments.join('/'));
    return [];
  }
  return listByPrefix(dir, prefix, extensions).map((entry) => ({
    kind,
    path: join(dir, entry.name),
    name: entry.name,
    bytes: entry.bytes,
    route,
  }));
}

/**
 * Scan the companion artefacts of one article.
 *
 * `notePath` must be the ABSOLUTE path of the note — the series directory is
 * derived from it, and a vault-relative path would resolve against the CWD.
 */
export function scanDeliverables(notePath: string): DeliverableScan {
  const prefix = extractArticlePrefix(notePath);
  if (!prefix) {
    return { prefix: null, files: [], missingDirs: [] };
  }

  const seriesDir = dirname(notePath);
  const missingDirs: string[] = [];

  const files: DeliverableFile[] = [
    ...collect(seriesDir, ['assets', '封面'], prefix, 'cover', 'cover', IMAGE_EXTENSIONS, missingDirs),
    ...collect(
      seriesDir,
      ['assets', '金句卡'],
      prefix,
      'quote-card',
      'image-library',
      IMAGE_EXTENSIONS,
      missingDirs
    ),
    ...collect(
      seriesDir,
      ['assets', 'png'],
      prefix,
      'illustration',
      'body-inline',
      IMAGE_EXTENSIONS,
      missingDirs
    ),
    ...collect(
      seriesDir,
      ['配套交付物'],
      prefix,
      'template',
      // WeChat has no file attachments. These can only travel as a KDocs link
      // pushed through a keyword auto-reply — never as an upload.
      'not-transferable',
      TEMPLATE_EXTENSIONS,
      missingDirs
    ),
  ];

  return { prefix, files, missingDirs };
}

/**
 * Pick the local cover for an article: `assets/封面/NN-*.png`, and only when
 * exactly one candidate exists. Ambiguity is surfaced, never resolved silently.
 */
export function findLocalCover(scan: DeliverableScan): {
  unique?: DeliverableFile;
  candidates: DeliverableFile[];
} {
  const candidates = scan.files.filter((file) => file.kind === 'cover');
  return candidates.length === 1
    ? { unique: candidates[0], candidates }
    : { candidates };
}

/**
 * Cover candidates offered in the picker: the article's own covers first, then
 * its quote cards (which are also used as cover/social images).
 */
export function coverCandidates(scan: DeliverableScan): DeliverableFile[] {
  const covers = scan.files.filter((file) => file.kind === 'cover');
  const quoteCards = scan.files.filter((file) => file.kind === 'quote-card');
  return [...covers, ...quoteCards];
}

/** Compact multi-line status report. Nothing is silently dropped. */
export function formatReceipt(scan: DeliverableScan): string {
  if (!scan.prefix) {
    return '配套件：文件名没有两位编号前缀，已跳过扫描。';
  }

  const lines: string[] = [`配套件（编号 ${scan.prefix}）：`];
  const buckets: Array<[DeliverableKind, string]> = [
    ['cover', '封面'],
    ['quote-card', '金句卡'],
    ['illustration', '正文配图'],
    ['template', '交付物'],
  ];

  for (const [kind, label] of buckets) {
    const items = scan.files.filter((file) => file.kind === kind);
    if (items.length === 0) {
      lines.push(`  · ${label}：未找到`);
      continue;
    }
    const detail = items.map((file) => `${file.name} (${formatBytes(file.bytes)})`).join('、');
    const suffix =
      items[0].route === 'not-transferable' ? ' → 需转金山文档，公众号不支持文件附件' : '';
    lines.push(`  · ${label}：${detail}${suffix}`);
  }

  if (scan.missingDirs.length > 0) {
    lines.push(`  · 目录缺失：${scan.missingDirs.join('、')}`);
  }

  return lines.join('\n');
}
