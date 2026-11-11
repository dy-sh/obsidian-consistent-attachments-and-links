import type {
  App,
  TFile
} from 'obsidian';

import { getFileOrNull } from '@mnaoumov/obsidian-lib/file-system';
import { initI18N } from '@mnaoumov/obsidian-lib/i18n/i18n';
import { generateMarkdownLink } from '@mnaoumov/obsidian-lib/link';
import { findPluginApi } from '@mnaoumov/obsidian-lib/plugin/plugin-api';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type { PluginSettingsComponent } from '../settings/plugin-settings-component.ts';
import type {
  AdvancedMetadataCacheHtmlApi,
  HtmlDiagnostic
} from '../sibling-plugins/advanced-metadata-cache.ts';

vi.mock('@mnaoumov/obsidian-lib/plugin/plugin-api', () => ({ findPluginApi: vi.fn() }));

vi.mock('@mnaoumov/obsidian-lib/file-system', async (importOriginal) => ({
  ...await importOriginal<typeof import('@mnaoumov/obsidian-lib/file-system')>(),
  getFileOrNull: vi.fn()
}));

vi.mock('@mnaoumov/obsidian-lib/link', async (importOriginal) => ({
  ...await importOriginal<typeof import('@mnaoumov/obsidian-lib/link')>(),
  generateMarkdownLink: vi.fn()
}));

// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { MAX_REPORTED_ENTRIES_PER_SECTION } from '../consistency-check/report-entry-budget.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import { translationsMap } from '../i18n/locales/translations-map.ts';
// eslint-disable-next-line import-x/first, import-x/imports-first -- vi.mock must precede imports.
import {
  HtmlProblemCheckResult,
  HtmlProblemHandler
} from './html-problem-handler.ts';

const mockFindPluginApi = vi.mocked(findPluginApi);
const mockGetFileOrNull = vi.mocked(getFileOrNull);
const mockGenerateMarkdownLink = vi.mocked(generateMarkdownLink);

const app = castTo<App>({});
const isPathIgnored = vi.fn((_path: string): boolean => false);
const pluginSettingsComponent = strictProxy<PluginSettingsComponent>({
  settings: castTo<PluginSettingsComponent['settings']>({ isPathIgnored })
});

function createApi(answers: Record<string, HtmlDiagnostic[] | null>): AdvancedMetadataCacheHtmlApi {
  return {
    getHtmlDiagnosticsSafe: vi.fn((path: string) => Promise.resolve(answers[path] ?? null))
  };
}

function createDiagnostic(kind: HtmlDiagnostic['kind'], html: string, line: number, offset: number): HtmlDiagnostic {
  return {
    kind,
    range: {
      html,
      isClosing: false,
      kind: 'tag',
      namespace: 'html',
      position: {
        end: { col: html.length, line, offset: offset + html.length },
        start: { col: 0, line, offset }
      },
      tagName: html.slice(1, -1).toLowerCase()
    }
  };
}

describe('HtmlProblemHandler', () => {
  beforeAll(async () => {
    await initI18N(translationsMap);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    isPathIgnored.mockReturnValue(false);
    mockGetFileOrNull.mockImplementation(({ pathOrFile }) => strictProxy<TFile>({ path: typeof pathOrFile === 'string' ? pathOrFile : pathOrFile?.path ?? '' }));
    mockGenerateMarkdownLink.mockImplementation(({ targetPathOrFile }) => `[[${typeof targetPathOrFile === 'string' ? targetPathOrFile : targetPathOrFile.path}]]`);
  });

  it('asks for contract 1.15.0 of Advanced Metadata Cache, once per walk', () => {
    const api = createApi({});
    mockFindPluginApi.mockReturnValue(api);
    const result = new HtmlProblemHandler({ pluginSettingsComponent }).createResult();
    expect(result.api).toBe(api);
    expect(mockFindPluginApi).toHaveBeenCalledExactlyOnceWith({ apiVersionRange: '^1.15.0', pluginId: 'advanced-metadata-cache' });
  });

  it('treats a revoked registry record as absent', () => {
    mockFindPluginApi.mockImplementation(() => {
      throw new Error('revoked');
    });
    expect(new HtmlProblemHandler({ pluginSettingsComponent }).createResult().api).toBeNull();
  });

  it('says the section was not checked when the provider is absent', async () => {
    mockFindPluginApi.mockReturnValue(null);
    const handler = new HtmlProblemHandler({ pluginSettingsComponent });
    const result = handler.createResult();
    await handler.check({ htmlProblems: result, notePath: 'note.md' });
    expect(result.toString(app, 'report.md')).toBe(
      '# HTML problems\nNot checked: needs the `Advanced Metadata Cache` plugin, version 2.5.0 or later, with its `HTML` module turned on.\n\n'
    );
  });

  it('reports each diagnostic in source order, with its line and kind', async () => {
    const api = createApi({
      'clean.md': [],
      'note.md': [
        createDiagnostic('sanitized', '<script>', 4, 50),
        createDiagnostic('unknown', '<nonExistingTag>', 1, 3),
        createDiagnostic('sanitized', '<nonExistingTag>', 1, 3)
      ]
    });
    mockFindPluginApi.mockReturnValue(api);
    const handler = new HtmlProblemHandler({ pluginSettingsComponent });
    const result = handler.createResult();
    await handler.check({ htmlProblems: result, notePath: 'note.md' });
    await handler.check({ htmlProblems: result, notePath: 'clean.md' });

    expect(result.toString(app, 'report.md')).toBe(
      '# HTML problems (3 in 1 notes)\n\n> [!warning]- [[note.md]] (3)\n'
        + '> - (line 2): `<nonExistingTag>` is changed or removed when Obsidian renders it\n'
        + '> - (line 2): `<nonExistingTag>` is not a known HTML element\n'
        + '> - (line 5): `<script>` is changed or removed when Obsidian renders it\n\n'
    );
  });

  it('keeps a backtick in the source from breaking the code span', async () => {
    mockFindPluginApi.mockReturnValue(createApi({ 'note.md': [createDiagnostic('unknown', '<x-a title="`">', 0, 0)] }));
    const handler = new HtmlProblemHandler({ pluginSettingsComponent });
    const result = handler.createResult();
    await handler.check({ htmlProblems: result, notePath: 'note.md' });
    expect(result.toString(app, 'report.md')).toContain('`<x-a title="\'">`');
  });

  it('counts notes the provider could not answer for, and says so', async () => {
    mockFindPluginApi.mockReturnValue(createApi({ 'done.md': [] }));
    const handler = new HtmlProblemHandler({ pluginSettingsComponent });
    const result = handler.createResult();
    await handler.check({ htmlProblems: result, notePath: 'pending.md' });
    await handler.check({ htmlProblems: result, notePath: 'done.md' });
    expect(result.uncheckedNoteCount).toBe(1);
    const text = result.toString(app, 'report.md');
    expect(text).toContain('# HTML problems\nNo problems found\n\n');
    expect(text).toContain('Not checked: 1 note(s).');
  });

  it('skips an ignored note without asking the provider', async () => {
    const api = createApi({});
    mockFindPluginApi.mockReturnValue(api);
    isPathIgnored.mockReturnValue(true);
    const handler = new HtmlProblemHandler({ pluginSettingsComponent });
    const result = handler.createResult();
    await handler.check({ htmlProblems: result, notePath: 'note.md' });
    expect(api.getHtmlDiagnosticsSafe).not.toHaveBeenCalled();
    expect(result.uncheckedNoteCount).toBe(0);
  });

  it('leaves out a note deleted before the report is written', () => {
    const result = new HtmlProblemCheckResult(createApi({}));
    result.add('gone.md', [createDiagnostic('unknown', '<foo>', 0, 0)]);
    mockGetFileOrNull.mockReturnValue(null);
    expect(result.toString(app, 'report.md')).toBe('# HTML problems (1 in 1 notes)\n\n');
  });

  it('caps the listed entries like every other section', () => {
    const result = new HtmlProblemCheckResult(createApi({}));
    const diagnostics = Array.from({ length: MAX_REPORTED_ENTRIES_PER_SECTION + 1 }, (_, index) => createDiagnostic('unknown', '<foo>', index, index));
    result.add('a.md', diagnostics);
    result.add('b.md', [createDiagnostic('unknown', '<bar>', 0, 0)]);
    const text = result.toString(app, 'report.md');
    expect(text.match(/^> - /gmu)).toHaveLength(MAX_REPORTED_ENTRIES_PER_SECTION);
    expect(text).toContain('Not listed: 2 more.');
    expect(text).not.toContain('[[b.md]]');
  });
});
