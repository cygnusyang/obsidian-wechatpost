export type ThemePreset = 'classic' | 'magazine' | 'minimal';

export interface ContentStyleSettings {
  themePreset: ThemePreset;
  bodyFontSize: number;
  lineHeight: number;
  textColor: string;
  headingColor: string;
  linkColor: string;
}

export interface WeChatPostSettings {
  /** Absolute path to `wechatpost-mcp/dist/index.js` (the MCP server entrypoint). */
  serverPath: string;
  defaultAuthor: string;
  digestLength: number;
  declareOriginal: boolean;
  enableAppreciation: boolean;
  defaultCollection: string;
  publishDirectly: boolean;
  contentStyle: ContentStyleSettings;
}

export const DEFAULT_SETTINGS: WeChatPostSettings = {
  serverPath: '/Users/cygnus/work/github/wechatpost-mcp/dist/index.js',
  defaultAuthor: '',
  digestLength: 120,
  declareOriginal: true,
  enableAppreciation: true,
  defaultCollection: '智能体',
  publishDirectly: true,
  contentStyle: {
    themePreset: 'classic',
    bodyFontSize: 16,
    lineHeight: 1.85,
    textColor: '#1f2329',
    headingColor: '#0f172a',
    linkColor: '#0969da',
  },
};
