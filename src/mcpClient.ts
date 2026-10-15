import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

/**
 * The MCP transport expects a `Record<string, string>`, but Node's `process.env`
 * is `Record<string, string | undefined>`. Drop undefined values so the types line up.
 */
function sanitizeEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * In Obsidian's Electron main process, `process.execPath` is the Obsidian app
 * binary, NOT Node — spawning it would never start the MCP server. Resolve a
 * real Node executable instead. Under plain Node, `process.execPath` is node
 * itself and is used directly.
 */
function resolveNodeExecutable(): string {
  const execPath = process.execPath || '';
  if (/\bnode(\.exe)?$/.test(execPath)) {
    return execPath; // running under plain Node
  }

  if (process.env.NODE && existsSync(process.env.NODE)) {
    return process.env.NODE;
  }

  const candidates = [
    '/opt/homebrew/bin/node',
    '/usr/local/bin/node',
    '/usr/bin/node',
    `${process.env.HOME}/.local/bin/node`,
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  try {
    return execFileSync('which', ['node'], { encoding: 'utf8' }).trim();
  } catch {
    throw new Error(
      'Could not locate a Node.js executable to run wechatpost-mcp. Install Node.js and make sure it is on PATH.'
    );
  }
}

export interface PublishArgs {
  content: string;
  title?: string;
  sourceFilePath?: string;
  author?: string;
  digest?: string;
  isOriginal?: boolean;
  enableAppreciation?: boolean;
  defaultCollection?: string;
  /**
   * Absolute path of a local cover image. When set, the engine skips its AI
   * cover generator and uploads this file as the article cover instead.
   */
  coverImagePath?: string;
  /** Default true: fall back to the AI cover when the local one cannot be set. */
  coverFallbackToAi?: boolean;
  publish?: boolean;
  themePreset?: string;
  bodyFontSize?: number;
  lineHeight?: number;
  textColor?: string;
  headingColor?: string;
  linkColor?: string;
}

export interface ConfigureArgs {
  defaultAuthor?: string;
  digestLength?: number;
  declareOriginal?: boolean;
  enableAppreciation?: boolean;
  defaultCollection?: string;
  publishDirectly?: boolean;
  themePreset?: string;
  bodyFontSize?: number;
  lineHeight?: number;
  textColor?: string;
  headingColor?: string;
  linkColor?: string;
}

export interface StatusResult {
  active: boolean;
  hasSavedLogin: boolean;
  userDataDir: string;
}

/**
 * Thin JSON-RPC (MCP stdio) client for the existing `wechatpost-mcp` server.
 * Responsible for the child process lifecycle only; it never touches the
 * browser-automation logic (PlaywrightService lives inside the server).
 */
export class WeChatMCPClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private serverPath: string;

  constructor(serverPath: string) {
    this.serverPath = serverPath;
  }

  get path(): string {
    return this.serverPath;
  }

  private async ensureConnected(): Promise<Client> {
    if (this.client) {
      return this.client;
    }

    const transport = new StdioClientTransport({
      command: resolveNodeExecutable(),
      args: [this.serverPath],
      stderr: 'pipe',
      env: sanitizeEnv(process.env),
    });

    let stderrBuf = '';
    const stderrStream = transport.stderr;
    if (stderrStream) {
      stderrStream.on('data', (chunk: Buffer | string) => {
        stderrBuf += chunk.toString();
        if (stderrBuf.length > 4000) {
          stderrBuf = stderrBuf.slice(-4000);
        }
      });
    }

    const client = new Client(
      { name: 'obsidian-wechatpost', version: '0.0.1' },
      { capabilities: {} }
    );

    try {
      await client.connect(transport);
    } catch (err) {
      const detail = stderrBuf ? `\nserver stderr:\n${stderrBuf}` : '';
      throw new Error(`Failed to start wechatpost-mcp at ${this.serverPath}${detail}\n${String(err)}`);
    }

    this.client = client;
    this.transport = transport;
    return client;
  }

  /** Run a tool and return the text payload + raw structured content. */
  private async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<{ text: string; raw: unknown }> {
    const client = await this.ensureConnected();
    const result = await client.callTool({ name, arguments: args });

    const content = (result as { content?: Array<{ type: string; text?: string }> }).content ?? [];
    const text = content
      .map((item) => (item.type === 'text' ? item.text ?? '' : ''))
      .join('\n');

    return { text, raw: result };
  }

  async status(): Promise<StatusResult> {
    const { text } = await this.callTool('wechat_status', {});
    try {
      return JSON.parse(text) as StatusResult;
    } catch {
      throw new Error(`wechat_status returned non-JSON: ${text}`);
    }
  }

  async login(): Promise<string> {
    const { text } = await this.callTool('wechat_login', {});
    return text;
  }

  async logout(clearProfile?: boolean): Promise<string> {
    const { text } = await this.callTool('wechat_logout', { clearProfile });
    return text;
  }

  async configure(args: ConfigureArgs): Promise<string> {
    const { text } = await this.callTool('wechat_configure', args as unknown as Record<string, unknown>);
    return text;
  }

  async publish(args: PublishArgs): Promise<string> {
    const { text } = await this.callTool('wechat_publish', args as unknown as Record<string, unknown>);
    return text;
  }

  async preview(content: string, sourceFilePath?: string): Promise<string> {
    const { text } = await this.callTool('wechat_preview', { content, sourceFilePath });
    return text;
  }

  async close(): Promise<void> {
    try {
      await this.transport?.close();
    } catch {
      // ignore close errors
    }
    this.client = null;
    this.transport = null;
  }
}
