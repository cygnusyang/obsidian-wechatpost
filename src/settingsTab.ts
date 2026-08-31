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
      .setName('Default collection')
      .setDesc('WeChat 合集 (collection) to associate with the article.')
      .addText((text) =>
        text
          .setPlaceholder('智能体')
          .setValue(this.plugin.settings.defaultCollection)
          .onChange(async (value) => {
            this.plugin.settings.defaultCollection = value;
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
