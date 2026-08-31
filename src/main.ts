import { Notice, Plugin } from 'obsidian';
import { WeChatMCPClient } from './mcpClient';
import { DEFAULT_SETTINGS, type WeChatPostSettings } from './settings';
import { resolveServerPath } from './serverLocator';
import { resolveArticleTitle } from './utils';
import { WeChatPostSettingTab } from './settingsTab';

export default class WeChatPostPlugin extends Plugin {
  settings: WeChatPostSettings = { ...DEFAULT_SETTINGS };
  private client: WeChatMCPClient | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addRibbonIcon('send', 'Publish current note to WeChat', () => {
      void this.publishCurrentNote();
    });

    this.addCommand({
      id: 'publish-current-note',
      name: 'Publish current note to WeChat',
      callback: () => void this.publishCurrentNote(),
    });

    this.addCommand({
      id: 'save-current-note-draft',
      name: 'Save current note as WeChat draft',
      callback: () => void this.saveCurrentNoteAsDraft(),
    });

    this.addCommand({
      id: 'preview-current-note',
      name: 'Preview current note (WeChat layout)',
      callback: () => void this.previewCurrentNote(),
    });

    this.addCommand({
      id: 'configure-publish-options',
      name: 'Configure WeChat publish options',
      callback: () => void this.openSettings(),
    });

    this.addCommand({
      id: 'login',
      name: 'Log in to WeChat (QR code)',
      callback: () => void this.login(),
    });

    this.addCommand({
      id: 'logout',
      name: 'Log out of WeChat',
      callback: () => void this.logout(),
    });

    this.addSettingTab(new WeChatPostSettingTab(this.app, this));
  }

  onunload(): void {
    void this.client?.close();
    this.client = null;
  }

  /** Lazily create / reuse the MCP client bound to the current server path. */
  private async getClient(): Promise<WeChatMCPClient> {
    const serverPath = resolveServerPath(this.settings.serverPath);
    if (this.client && this.client.path === serverPath) {
      return this.client;
    }
    await this.client?.close();
    this.client = new WeChatMCPClient(serverPath);
    return this.client;
  }

  private async getActiveNote(): Promise<{ content: string; filePath: string } | null> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice('No active note opened in Obsidian.');
      return null;
    }
    if (file.extension !== 'md') {
      new Notice('Active file is not a Markdown note.');
      return null;
    }
    const content = await this.app.vault.read(file);
    return { content, filePath: file.path };
  }

  private async ensureLoggedIn(status: { active: boolean; hasSavedLogin: boolean }): Promise<void> {
    if (status.active) {
      return;
    }
    new Notice(
      status.hasSavedLogin
        ? 'Restoring saved WeChat session... (a Chrome window may open)'
        : 'No saved login. Opening Chrome for QR scan — please scan within 2 minutes.'
    );
    await this.client!.login();
  }

  async publishCurrentNote(): Promise<void> {
    const note = await this.getActiveNote();
    if (!note) {
      return;
    }

    const client = await this.getClient();
    try {
      const status = await client.status();
      await this.ensureLoggedIn(status);

      const title = resolveArticleTitle(note.content, note.filePath);
      const s = this.settings;
      new Notice(`Publishing "${title}" to WeChat...`);

      const text = await client.publish({
        content: note.content,
        sourceFilePath: note.filePath,
        title,
        author: s.defaultAuthor || undefined,
        digest: note.content.slice(0, s.digestLength),
        isOriginal: s.declareOriginal,
        enableAppreciation: s.enableAppreciation,
        defaultCollection: s.defaultCollection,
        publish: s.publishDirectly,
        themePreset: s.contentStyle.themePreset,
        bodyFontSize: s.contentStyle.bodyFontSize,
        lineHeight: s.contentStyle.lineHeight,
        textColor: s.contentStyle.textColor,
        headingColor: s.contentStyle.headingColor,
        linkColor: s.contentStyle.linkColor,
      });

      new Notice(text);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[WeChatPost] publish failed:', error);
      new Notice(`WeChatPost publish failed: ${msg}`);
    }
  }

  async saveCurrentNoteAsDraft(): Promise<void> {
    const note = await this.getActiveNote();
    if (!note) {
      return;
    }

    const client = await this.getClient();
    try {
      const status = await client.status();
      await this.ensureLoggedIn(status);

      const title = resolveArticleTitle(note.content, note.filePath);
      const s = this.settings;
      new Notice(`Saving "${title}" as draft...`);

      const text = await client.publish({
        content: note.content,
        sourceFilePath: note.filePath,
        title,
        author: s.defaultAuthor || undefined,
        digest: note.content.slice(0, s.digestLength),
        isOriginal: s.declareOriginal,
        enableAppreciation: s.enableAppreciation,
        defaultCollection: s.defaultCollection,
        publish: false,
        themePreset: s.contentStyle.themePreset,
        bodyFontSize: s.contentStyle.bodyFontSize,
        lineHeight: s.contentStyle.lineHeight,
        textColor: s.contentStyle.textColor,
        headingColor: s.contentStyle.headingColor,
        linkColor: s.contentStyle.linkColor,
      });

      new Notice(text);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[WeChatPost] draft failed:', error);
      new Notice(`WeChatPost draft failed: ${msg}`);
    }
  }

  async previewCurrentNote(): Promise<void> {
    const note = await this.getActiveNote();
    if (!note) {
      return;
    }

    const client = await this.getClient();
    try {
      new Notice('Rendering WeChat preview...');
      const text = await client.preview(note.content, note.filePath);
      new Notice(text);
      console.info('[WeChatPost] preview:', text);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[WeChatPost] preview failed:', error);
      new Notice(`WeChatPost preview failed: ${msg}`);
    }
  }

  async login(): Promise<void> {
    const client = await this.getClient();
    try {
      new Notice('Logging in... watch for a Chrome window (QR scan).');
      const text = await client.login();
      new Notice(text);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[WeChatPost] login failed:', error);
      new Notice(`WeChatPost login failed: ${msg}`);
    }
  }

  async logout(): Promise<void> {
    const client = await this.getClient();
    try {
      await client.logout(true);
      new Notice('WeChatPost logged out and cleared the saved profile.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[WeChatPost] logout failed:', error);
      new Notice(`WeChatPost logout failed: ${msg}`);
    }
  }

  async openSettings(): Promise<void> {
    // Obsidian does not expose a version-stable "open settings tab" API.
    new Notice('Open Settings → Community plugins → WeChatPost Publisher to configure.');
  }

  async loadSettings(): Promise<void> {
    const loaded = await this.loadData();
    if (loaded) {
      this.settings = { ...DEFAULT_SETTINGS, ...loaded };
    }
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
