import { FileSystemAdapter, Notice, Plugin } from 'obsidian';
import { basename } from 'node:path';
import { WeChatMCPClient, type PublishArgs } from './mcpClient';
import { DEFAULT_SETTINGS, type WeChatPostSettings } from './settings';
import { resolveServerPath } from './serverLocator';
import {
  describeCollection,
  parseFrontmatter,
  resolveCollection,
  type CollectionResolution,
} from './frontmatter';
import {
  coverCandidates,
  findLocalCover,
  formatReceipt,
  scanDeliverables,
  type DeliverableScan,
} from './deliverables';
import { buildCoverOptions, CoverPickerModal } from './coverPicker';
import { resolveArticleTitle } from './utils';
import { WeChatPostSettingTab } from './settingsTab';

interface ActiveNote {
  content: string;
  /** Absolute path — the engine resolves relative image refs against its dirname. */
  filePath: string;
  /** Parsed note properties (frontmatter). */
  fields: Record<string, string>;
}

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
      id: 'scan-companion-deliverables',
      name: 'Show companion deliverables for current note',
      callback: () => void this.showDeliverables(),
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

  private async getActiveNote(): Promise<ActiveNote | null> {
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
    // file.path is vault-relative; the MCP server resolves relative image refs
    // against dirname(sourceFilePath), so it must receive an absolute path.
    const filePath =
      this.app.vault.adapter instanceof FileSystemAdapter
        ? `${this.app.vault.adapter.getBasePath()}/${file.path}`
        : file.path;
    // Always re-read and re-parse: editing the note properties then publishing
    // again must take effect without a plugin reload.
    return { content, filePath, fields: parseFrontmatter(content) };
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

  /**
   * Build the publish payload. The 合集 comes from the note's properties
   * (see `resolveCollection`), falling back to the plugin default — this is what
   * makes "每篇入对应系列合集" actually true instead of a global hardcoded name.
   */
  private buildPublishArgs(
    note: ActiveNote,
    title: string,
    publish: boolean,
    resolution: CollectionResolution,
    coverImagePath?: string
  ): PublishArgs {
    const s = this.settings;

    return {
      content: note.content,
      sourceFilePath: note.filePath,
      title,
      author: s.defaultAuthor || undefined,
      // A curated `description` beats the raw body opening as a digest.
      digest: (note.fields.description || note.content).slice(0, s.digestLength),
      isOriginal: s.declareOriginal,
      enableAppreciation: s.enableAppreciation,
      defaultCollection: resolution.collection,
      coverImagePath,
      coverFallbackToAi: s.coverFallbackToAi,
      publish,
      themePreset: s.contentStyle.themePreset,
      bodyFontSize: s.contentStyle.bodyFontSize,
      lineHeight: s.contentStyle.lineHeight,
      textColor: s.contentStyle.textColor,
      headingColor: s.contentStyle.headingColor,
      linkColor: s.contentStyle.linkColor,
    };
  }

  /**
   * Decide which local cover to use for this article.
   *
   * Returns the chosen absolute path, or `undefined` to leave the engine on its
   * AI-cover path. Dismissing the picker means "no local cover" — it never
   * silently substitutes a different file.
   */
  private async chooseLocalCover(scan: DeliverableScan): Promise<string | undefined> {
    if (!this.settings.useLocalCover) {
      return undefined;
    }
    if (!scan.prefix) {
      new Notice('文件名没有两位编号前缀，无法定位本地封面；改用 AI 封面。');
      return undefined;
    }

    const { unique, candidates } = findLocalCover(scan);
    if (candidates.length === 0) {
      new Notice(`未找到本地封面：assets/封面/${scan.prefix}-*.png 不存在。`);
      return undefined;
    }

    // Unambiguous match and no prompting configured: use it.
    if (!this.settings.askForCover && unique) {
      return unique.path;
    }
    if (!this.settings.askForCover) {
      new Notice(`assets/封面/ 下有 ${candidates.length} 张匹配封面，需要你选一张。`);
    }

    // The auto-matched cover is listed first and highlighted, so accepting it is
    // a single Enter press.
    return new Promise<string | undefined>((resolve) => {
      new CoverPickerModal(
        this.app,
        buildCoverOptions(unique, coverCandidates(scan)),
        (option) => resolve(option?.file.path)
      ).open();
    });
  }

  private async publishNote(publish: boolean): Promise<void> {
    const note = await this.getActiveNote();
    if (!note) {
      return;
    }

    const client = await this.getClient();
    try {
      const status = await client.status();
      await this.ensureLoggedIn(status);

      const title = resolveArticleTitle(note.content, note.filePath);
      const resolution = resolveCollection(
        note.fields,
        this.settings.collectionProperty,
        this.settings.defaultCollection
      );

      const scan = scanDeliverables(note.filePath);
      const coverImagePath = await this.chooseLocalCover(scan);
      const args = this.buildPublishArgs(note, title, publish, resolution, coverImagePath);

      new Notice(
        [
          `${publish ? 'Publishing' : 'Saving'} "${title}"...`,
          describeCollection(resolution),
          coverImagePath
            ? `封面：本地图 ${basename(coverImagePath)}`
            : '封面：AI 配图（本地封面未使用）',
        ].join('\n')
      );

      const text = await client.publish(args);
      // The deliverable report is shown even on success: anything missing must
      // be visible rather than implied.
      new Notice(`${text}\n\n${formatReceipt(scan)}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[WeChatPost] publish failed:', error);
      new Notice(`WeChatPost ${publish ? 'publish' : 'draft'} failed: ${msg}`);
    }
  }

  async publishCurrentNote(): Promise<void> {
    await this.publishNote(true);
  }

  async saveCurrentNoteAsDraft(): Promise<void> {
    await this.publishNote(false);
  }

  /**
   * Read-only: list the companion artefacts of the active note. Exists so the
   * scan can be checked without publishing anything.
   */
  async showDeliverables(): Promise<void> {
    const note = await this.getActiveNote();
    if (!note) {
      return;
    }
    const scan = scanDeliverables(note.filePath);
    console.info('[WeChatPost] companion deliverables:', scan);
    new Notice(formatReceipt(scan), 15000);
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
