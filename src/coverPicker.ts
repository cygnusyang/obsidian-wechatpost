/**
 * Cover picker shown at publish time.
 *
 * The auto-matched cover (`assets/封面/NN-*.png`) is listed first and is
 * highlighted by default, so the common case is one Enter press. Quote cards
 * follow, because they are also used as cover / social images.
 *
 * Dismissing the modal resolves to `null`, which means "no local cover" — the
 * caller then applies its own fallback policy. Nothing is chosen silently.
 */

import { App, SuggestModal } from 'obsidian';
import { formatBytes, readPngSize, type DeliverableFile } from './deliverables';

export interface CoverOption {
  file: DeliverableFile;
  /** True for the auto-matched cover, listed first and pre-highlighted. */
  recommended: boolean;
  /** e.g. "1080×460", when the file is a readable PNG. */
  dimensions?: string;
}

function kindLabel(kind: DeliverableFile['kind']): string {
  switch (kind) {
    case 'cover':
      return '封面';
    case 'quote-card':
      return '金句卡';
    case 'illustration':
      return '正文配图';
    case 'template':
      return '交付物';
    default:
      return kind;
  }
}

export function toCoverOption(file: DeliverableFile, recommended: boolean): CoverOption {
  const size = readPngSize(file.path);
  return {
    file,
    recommended,
    dimensions: size ? `${size.width}×${size.height}` : undefined,
  };
}

/** Auto-matched cover first, then the remaining candidates by name. */
export function buildCoverOptions(
  autoMatched: DeliverableFile | undefined,
  candidates: DeliverableFile[]
): CoverOption[] {
  const options: CoverOption[] = [];
  if (autoMatched) {
    options.push(toCoverOption(autoMatched, true));
  }
  for (const file of candidates) {
    if (autoMatched && file.path === autoMatched.path) {
      continue;
    }
    options.push(toCoverOption(file, false));
  }
  return options;
}

export class CoverPickerModal extends SuggestModal<CoverOption> {
  private readonly options: CoverOption[];
  private readonly resolve: (value: CoverOption | null) => void;
  private settled = false;

  constructor(app: App, options: CoverOption[], resolve: (value: CoverOption | null) => void) {
    super(app);
    this.options = options;
    this.resolve = resolve;
    this.limit = 50;
    this.setPlaceholder('选择本地封面（回车确认 / Esc 跳过）');
  }

  getSuggestions(query: string): CoverOption[] {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return this.options;
    }
    return this.options.filter(
      (option) =>
        option.file.name.toLowerCase().includes(needle) ||
        kindLabel(option.file.kind).includes(needle)
    );
  }

  renderSuggestion(option: CoverOption, el: HTMLElement): void {
    const title = el.createDiv({ text: option.file.name });
    if (option.recommended) {
      title.createSpan({ text: '　← 自动匹配' });
    }

    const meta = [
      kindLabel(option.file.kind),
      option.dimensions,
      formatBytes(option.file.bytes),
    ]
      .filter((part): part is string => Boolean(part))
      .join(' · ');
    el.createEl('small', { text: meta });
  }

  onChooseSuggestion(option: CoverOption): void {
    this.settle(option);
  }

  onClose(): void {
    // Esc or a click outside. Deferred so an actual choice, which closes the
    // modal too, is recorded before this runs.
    window.setTimeout(() => this.settle(null), 0);
  }

  private settle(value: CoverOption | null): void {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this.resolve(value);
  }
}
