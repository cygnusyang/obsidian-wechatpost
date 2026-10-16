import { App, PluginSettingTab, type SettingDefinitionItem } from 'obsidian';
import type WeChatPostPlugin from './main';
import type { ContentStyleSettings } from './settings';

/**
 * Keys into `contentStyle` are namespaced as `contentStyle.<prop>` so the
 * declarative control binding can resolve nested values through the
 * `getControlValue` / `setControlValue` overrides below.
 */
const CONTENT_STYLE_PREFIX = 'contentStyle.';

/**
 * Declarative settings tab (Obsidian 1.13+). The framework renders and
 * indexes `getSettingDefinitions()`, so the settings appear in the settings
 * search. Values bind through `getControlValue` / `setControlValue`, which
 * route nested `contentStyle.*` keys to the sub-object and persist on change.
 */
export class WeChatPostSettingTab extends PluginSettingTab {
  plugin: WeChatPostPlugin;

  constructor(app: App, plugin: WeChatPostPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  /** Required by the abstract base; unreachable while definitions are non-empty. */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();
  }

  /** Resolve a control key against the (possibly nested) settings object. */
  getControlValue(key: string): unknown {
    if (key.startsWith(CONTENT_STYLE_PREFIX)) {
      const prop = key.slice(CONTENT_STYLE_PREFIX.length) as keyof ContentStyleSettings;
      return this.plugin.settings.contentStyle[prop];
    }
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  /** Persist a control value, trimming the collection property as before. */
  async setControlValue(key: string, value: unknown): Promise<void> {
    const settings =
      key.startsWith(CONTENT_STYLE_PREFIX)
        ? (() => {
            const prop = key.slice(CONTENT_STYLE_PREFIX.length) as keyof ContentStyleSettings;
            return {
              ...this.plugin.settings,
              contentStyle: { ...this.plugin.settings.contentStyle, [prop]: value },
            };
          })()
        : { ...this.plugin.settings, [key]: value };

    if (key === 'collectionProperty' && typeof settings.collectionProperty === 'string') {
      settings.collectionProperty = settings.collectionProperty.trim();
    }

    this.plugin.settings = settings;
    await this.plugin.saveSettings();
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const s = this.plugin.settings;

    return [
      {
        type: 'group',
        heading: 'Server & defaults',
        items: [
          {
            name: 'wechatpost-mcp server path',
            desc: 'Absolute path to the wechatpost-mcp dist/index.js entrypoint.',
            control: {
              type: 'text',
              key: 'serverPath',
              placeholder: '/path/to/wechatpost-mcp/dist/index.js',
              defaultValue: s.serverPath,
            },
          },
          {
            name: 'Default author',
            desc: 'Author name shown in the article.',
            control: { type: 'text', key: 'defaultAuthor', placeholder: 'Unknown', defaultValue: s.defaultAuthor },
          },
          {
            name: 'Digest length (characters)',
            desc: 'How many leading characters to use as the article summary.',
            control: {
              type: 'number',
              key: 'digestLength',
              min: 0,
              step: 1,
              placeholder: '120',
              defaultValue: s.digestLength,
            },
          },
          {
            name: 'Collection property (frontmatter key)',
            desc: [
              'Note property holding the WeChat 合集 name. Read first; "collection" is always ',
              'accepted as an alias. "category" is deliberately not used — it holds a topic ',
              'class, not a collection name.',
            ].join(''),
            control: { type: 'text', key: 'collectionProperty', placeholder: 'catalog', defaultValue: s.collectionProperty },
          },
          {
            name: 'Default collection (fallback)',
            desc: [
              'Used only when the note has no collection property. Must match an existing ',
              'collection in the WeChat backend exactly.',
            ].join(''),
            control: {
              type: 'text',
              key: 'defaultCollection',
              placeholder: '工程那些事',
              defaultValue: s.defaultCollection,
            },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Cover image',
        items: [
          {
            name: 'Use local cover image',
            desc: [
              'Upload `assets/封面/NN-*.png` as the article cover instead of the AI-generated one. ',
              'Off restores the original AI cover flow.',
            ].join(''),
            control: { type: 'toggle', key: 'useLocalCover', defaultValue: s.useLocalCover },
          },
          {
            name: 'Ask for the cover on every publish',
            desc: [
              'Show a picker when publishing. The auto-matched cover is listed first and pre-selected, ',
              'so Enter accepts it. Off uses the auto-matched cover without asking.',
            ].join(''),
            control: { type: 'toggle', key: 'askForCover', defaultValue: s.askForCover },
          },
          {
            name: 'Fall back to AI cover',
            desc: [
              'When no local cover is found (or the upload fails), use the AI cover instead. ',
              'Off aborts the publish instead, so a missing cover is never replaced silently.',
            ].join(''),
            control: { type: 'toggle', key: 'coverFallbackToAi', defaultValue: s.coverFallbackToAi },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Publishing',
        items: [
          {
            name: 'Publish directly by default',
            desc: 'On: publish immediately. Off: save as a draft.',
            control: { type: 'toggle', key: 'publishDirectly', defaultValue: s.publishDirectly },
          },
          {
            name: 'Declare original by default',
            desc: 'Enable 原创声明 on published articles.',
            control: { type: 'toggle', key: 'declareOriginal', defaultValue: s.declareOriginal },
          },
          {
            name: 'Enable appreciation by default',
            desc: 'Enable 赞赏 on published articles.',
            control: { type: 'toggle', key: 'enableAppreciation', defaultValue: s.enableAppreciation },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Content style',
        items: [
          {
            name: 'Theme preset',
            desc: 'Typography/layout theme.',
            control: {
              type: 'dropdown',
              key: 'contentStyle.themePreset',
              options: { classic: 'Classic', magazine: 'Magazine', minimal: 'Minimal' },
              defaultValue: s.contentStyle.themePreset,
            },
          },
          {
            name: 'Body text color',
            control: { type: 'color', key: 'contentStyle.textColor', defaultValue: s.contentStyle.textColor },
          },
          {
            name: 'Heading color',
            control: { type: 'color', key: 'contentStyle.headingColor', defaultValue: s.contentStyle.headingColor },
          },
          {
            name: 'Link / accent color',
            control: { type: 'color', key: 'contentStyle.linkColor', defaultValue: s.contentStyle.linkColor },
          },
          {
            name: 'Body font size (px)',
            control: {
              type: 'number',
              key: 'contentStyle.bodyFontSize',
              min: 12,
              max: 22,
              step: 1,
              defaultValue: s.contentStyle.bodyFontSize,
            },
          },
          {
            name: 'Line height',
            control: {
              type: 'number',
              key: 'contentStyle.lineHeight',
              min: 1.2,
              max: 2.4,
              step: 0.05,
              defaultValue: s.contentStyle.lineHeight,
            },
          },
        ],
      },
    ];
  }
}
