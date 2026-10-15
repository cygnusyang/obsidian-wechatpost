import { App, PluginSettingTab, Setting } from 'obsidian';
import type WeChatPostPlugin from './main';

export class WeChatPostSettingTab extends PluginSettingTab {
  plugin: WeChatPostPlugin;

  constructor(app: App, plugin: WeChatPostPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'WeChatPost Publisher' });

    new Setting(containerEl)
      .setName('wechatpost-mcp server path')
      .setDesc('Absolute path to the wechatpost-mcp dist/index.js entrypoint.')
      .addText((text) =>
        text
          .setPlaceholder('/path/to/wechatpost-mcp/dist/index.js')
          .setValue(this.plugin.settings.serverPath)
          .onChange(async (value) => {
            this.plugin.settings.serverPath = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Default author')
      .setDesc('Author name shown in the article.')
      .addText((text) =>
        text
          .setPlaceholder('Unknown')
          .setValue(this.plugin.settings.defaultAuthor)
          .onChange(async (value) => {
            this.plugin.settings.defaultAuthor = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Digest length (characters)')
      .setDesc('How many leading characters to use as the article summary.')
      .addText((text) =>
        text
          .setPlaceholder('120')
          .setValue(String(this.plugin.settings.digestLength))
          .onChange(async (value) => {
            const parsed = Number(value);
            if (Number.isFinite(parsed) && parsed >= 0) {
              this.plugin.settings.digestLength = parsed;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('Collection property (frontmatter key)')
      .setDesc(
        'Note property holding the WeChat 合集 name. Read first; "collection" is always ' +
          'accepted as an alias. "category" is deliberately not used — it holds a topic ' +
          'class, not a collection name.'
      )
      .addText((text) =>
        text
          .setPlaceholder('catalog')
          .setValue(this.plugin.settings.collectionProperty)
          .onChange(async (value) => {
            this.plugin.settings.collectionProperty = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Default collection (fallback)')
      .setDesc(
        'Used only when the note has no collection property. Must match an existing ' +
          'collection in the WeChat backend exactly.'
      )
      .addText((text) =>
        text
          .setPlaceholder('工程那些事')
          .setValue(this.plugin.settings.defaultCollection)
          .onChange(async (value) => {
            this.plugin.settings.defaultCollection = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl('h3', { text: 'Cover image' });

    new Setting(containerEl)
      .setName('Use local cover image')
      .setDesc(
        'Upload `assets/封面/NN-*.png` as the article cover instead of the AI-generated one. ' +
          'Off restores the original AI cover flow.'
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.useLocalCover).onChange(async (value) => {
          this.plugin.settings.useLocalCover = value;
          await this.plugin.saveSettings();
          this.display();
        })
      );

    new Setting(containerEl)
      .setName('Ask for the cover on every publish')
      .setDesc(
        'Show a picker when publishing. The auto-matched cover is listed first and pre-selected, ' +
          'so Enter accepts it. Off uses the auto-matched cover without asking.'
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.askForCover).onChange(async (value) => {
          this.plugin.settings.askForCover = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Fall back to AI cover')
      .setDesc(
        'When no local cover is found (or the upload fails), use the AI cover instead. ' +
          'Off aborts the publish instead, so a missing cover is never replaced silently.'
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.coverFallbackToAi).onChange(async (value) => {
          this.plugin.settings.coverFallbackToAi = value;
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName('Publish directly by default')
      .setDesc('On: publish immediately. Off: save as a draft.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.publishDirectly)
          .onChange(async (value) => {
            this.plugin.settings.publishDirectly = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Declare original by default')
      .setDesc('Enable 原创声明 on published articles.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.declareOriginal)
          .onChange(async (value) => {
            this.plugin.settings.declareOriginal = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Enable appreciation by default')
      .setDesc('Enable 赞赏 on published articles.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableAppreciation)
          .onChange(async (value) => {
            this.plugin.settings.enableAppreciation = value;
            await this.plugin.saveSettings();
          })
      );

    // Content style controls.
    const cs = this.plugin.settings.contentStyle;

    new Setting(containerEl)
      .setName('Theme preset')
      .setDesc('Typography/layout theme.')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('classic', 'Classic')
          .addOption('magazine', 'Magazine')
          .addOption('minimal', 'Minimal')
          .setValue(cs.themePreset)
          .onChange(async (value) => {
            cs.themePreset = value as typeof cs.themePreset;
            this.plugin.settings.contentStyle = cs;
            await this.plugin.saveSettings();
          })
      );

    const addColor = (label: string, key: keyof typeof cs): void => {
      new Setting(containerEl).setName(label).addText((text) =>
        text
          .setValue(cs[key] as string)
          .onChange(async (value) => {
            (cs as unknown as Record<string, unknown>)[key] = value;
            this.plugin.settings.contentStyle = cs;
            await this.plugin.saveSettings();
          })
      );
    };

    addColor('Body text color', 'textColor');
    addColor('Heading color', 'headingColor');
    addColor('Link / accent color', 'linkColor');

    new Setting(containerEl)
      .setName('Body font size (px)')
      .addText((text) =>
        text
          .setValue(String(cs.bodyFontSize))
          .onChange(async (value) => {
            const parsed = Number(value);
            if (Number.isFinite(parsed) && parsed >= 12 && parsed <= 22) {
              cs.bodyFontSize = parsed;
              this.plugin.settings.contentStyle = cs;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName('Line height')
      .addText((text) =>
        text
          .setValue(String(cs.lineHeight))
          .onChange(async (value) => {
            const parsed = Number(value);
            if (Number.isFinite(parsed) && parsed >= 1.2 && parsed <= 2.4) {
              cs.lineHeight = parsed;
              this.plugin.settings.contentStyle = cs;
              await this.plugin.saveSettings();
            }
          })
      );
  }
}
