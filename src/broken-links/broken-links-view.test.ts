import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type {
  App as AppOriginal,
  FrontmatterLinkCache,
  Notice,
  Reference,
  ReferenceCache,
  WorkspaceLeaf as WorkspaceLeafOriginal
} from 'obsidian';

import { noopAsync } from '@mnaoumov/typescript-lib/function';
import { castTo } from '@mnaoumov/typescript-lib/object-utils';
import { ensureNonNullable } from '@mnaoumov/typescript-lib/type-guards';
import { waitForAllAsyncOperations } from '@mnaoumov/typescript-test-toolkit/async-operation-tracking';
import { strictProxy } from '@mnaoumov/typescript-test-toolkit/strict-proxy';
import {
  App,
  WorkspaceLeaf
} from 'obsidian-test-mocks/obsidian';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from 'vitest';

import type {
  BrokenLink,
  BrokenLinkFix,
  BrokenLinkFixer
} from './broken-link-fixer.ts';

import { BrokenLinkEvidenceKind } from './broken-link-candidates.ts';
import { BrokenLinkKind } from './broken-link-fixer.ts';
import {
  BROKEN_LINKS_VIEW_TYPE,
  BrokenLinkGroupKind,
  BrokenLinksView,
  groupBrokenLinks,
  openBrokenLinksView
} from './broken-links-view.ts';

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve: (value: T) => void;
}

interface GlobalAppHolder {
  app: unknown;
}

let app: AppOriginal;
let previousGlobalApp: unknown;
let findBrokenLinks: ReturnType<typeof vi.fn<() => Promise<BrokenLink[]>>>;
let fix: ReturnType<typeof vi.fn<(fixes: readonly BrokenLinkFix[]) => Promise<BrokenLinkFix[]>>>;
let showNotice: ReturnType<typeof vi.fn<(message: DocumentFragment | string) => Notice>>;

function createBrokenLink(targetPath: string, candidatePaths: string[], overrides: Partial<BrokenLink> = {}): BrokenLink {
  return {
    candidates: candidatePaths.map((path) => ({ evidence: [{ description: `Evidence for ${path}.`, kind: BrokenLinkEvidenceKind.SameName }], path })),
    isTargetFound: false,
    kind: BrokenLinkKind.Link,
    reference: createReference(targetPath, 2),
    sourcePath: 'note.md',
    targetPath,
    ...overrides
  };
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | null = null;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: T): void {
      ensureNonNullable(resolvePromise)(value);
    }
  };
}

function createReference(link: string, line: number): ReferenceCache {
  return {
    displayText: link,
    link,
    original: `[[${link}]]`,
    position: { end: { col: 0, line, offset: 0 }, start: { col: 0, line, offset: 0 } }
  };
}

function createView(): BrokenLinksView {
  return new BrokenLinksView({
    brokenLinkFixer: strictProxy<BrokenLinkFixer>({ findBrokenLinks, fix }),
    leaf: WorkspaceLeaf.create2__(castTo<App>(app)).asOriginalType3__(),
    pluginNoticeComponent: strictProxy<PluginNoticeComponent>({ showNotice })
  });
}

function getButton(view: BrokenLinksView, text: string, index = 0): HTMLButtonElement {
  const button = [...view.contentEl.querySelectorAll('button')].filter((element) => element.textContent === text)[index];
  if (!button) {
    throw new Error(`No button "${text}" #${String(index)}`);
  }
  return button;
}

function getButtonTexts(view: BrokenLinksView): string[] {
  return [...view.contentEl.querySelectorAll('button')].map((element) => element.textContent);
}

async function openView(view: BrokenLinksView): Promise<void> {
  await WorkspaceLeaf.create2__(castTo<App>(app)).open(view);
}

describe('BrokenLinksView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const appMock = App.createConfigured__();
    app = castTo<AppOriginal>(appMock);
    previousGlobalApp = castTo<GlobalAppHolder>(window).app;
    castTo<GlobalAppHolder>(window).app = appMock;
    findBrokenLinks = vi.fn<() => Promise<BrokenLink[]>>().mockResolvedValue([]);
    fix = vi.fn<(fixes: readonly BrokenLinkFix[]) => Promise<BrokenLinkFix[]>>((fixes) => Promise.resolve([...fixes]));
    showNotice = vi.fn<(message: DocumentFragment | string) => Notice>(() => castTo<Notice>({}));
  });

  afterEach(() => {
    castTo<GlobalAppHolder>(window).app = previousGlobalApp;
    vi.restoreAllMocks();
  });

  it('should describe itself', () => {
    const view = createView();
    expect(view.getViewType()).toBe(BROKEN_LINKS_VIEW_TYPE);
    expect(view.getDisplayText()).toBe('Broken links');
    expect(view.getIcon()).toBe('unlink');
  });

  it('should open empty, with a Check button, and check only when asked', async () => {
    const view = createView();
    await openView(view);
    expect(view.contentEl.textContent).toContain('Check the vault to list its broken links.');
    expect(findBrokenLinks).not.toHaveBeenCalled();

    getButton(view, 'Check').click();
    await waitForAllAsyncOperations();

    expect(findBrokenLinks).toHaveBeenCalledOnce();
    expect(view.contentEl.textContent).toContain('No broken links found.');
    expect(getButtonTexts(view)).toStrictEqual(['Re-check']);
  });

  it('should say it is looking while the first check runs, and ignore a second one', async () => {
    const deferred = createDeferred<BrokenLink[]>();
    findBrokenLinks.mockReturnValue(deferred.promise);
    const view = createView();
    await openView(view);

    const recheck = view.recheck();
    expect(view.contentEl.textContent).toContain('Looking for broken links...');
    await view.recheck();
    deferred.resolve([]);
    await recheck;

    expect(findBrokenLinks).toHaveBeenCalledOnce();
  });

  it('should fix one link, and a whole group like it', async () => {
    findBrokenLinks.mockResolvedValue([
      createBrokenLink('old/a.md', ['new/a.md']),
      createBrokenLink('old/b.md', ['new/b.md']),
      createBrokenLink('lone/c.md', ['elsewhere/c.md'])
    ]);
    const view = createView();
    await openView(view);
    await view.recheck();

    expect(view.contentEl.textContent).toContain('"old" is now "new" (2)');
    expect(view.contentEl.textContent).toContain('Evidence for new/a.md.');

    getButton(view, 'Fix', 2).click();
    await waitForAllAsyncOperations();
    expect(fix).toHaveBeenLastCalledWith([expect.objectContaining({ targetPath: 'elsewhere/c.md' })]);
    expect(view.contentEl.textContent).not.toContain('lone/c.md');

    getButton(view, 'Fix all like this').click();
    await waitForAllAsyncOperations();
    expect(fix).toHaveBeenLastCalledWith([
      expect.objectContaining({ targetPath: 'new/a.md' }),
      expect.objectContaining({ targetPath: 'new/b.md' })
    ]);
    expect(view.contentEl.textContent).toContain('No broken links found.');
  });

  it('should offer a choice per candidate and never a group fix when several are known', async () => {
    findBrokenLinks.mockResolvedValue([createBrokenLink('a/x.md', ['b/x.md', 'c/x.md'])]);
    const view = createView();
    await openView(view);
    await view.recheck();

    expect(view.contentEl.textContent).toContain('Several candidates: choose one (1)');
    expect(getButtonTexts(view)).toStrictEqual(['Re-check', 'Use this', 'Use this', 'Open source', 'Ignore']);

    getButton(view, 'Use this', 1).click();
    await waitForAllAsyncOperations();
    expect(fix).toHaveBeenCalledWith([expect.objectContaining({ targetPath: 'c/x.md' })]);
  });

  it('should tell how many links had changed since the check and keep them listed', async () => {
    fix.mockResolvedValue([]);
    findBrokenLinks.mockResolvedValue([createBrokenLink('old/a.md', ['new/a.md'])]);
    const view = createView();
    await openView(view);
    await view.recheck();

    getButton(view, 'Fix').click();
    await waitForAllAsyncOperations();

    expect(showNotice).toHaveBeenCalledWith('1 of 1 links changed since the check and were left as they are. Re-check to see them as they are now.');
    expect(view.contentEl.textContent).toContain('old/a.md');
  });

  it('should ignore a fix requested while another runs', async () => {
    const deferred = createDeferred<BrokenLinkFix[]>();
    fix.mockReturnValue(deferred.promise);
    findBrokenLinks.mockResolvedValue([createBrokenLink('old/a.md', ['new/a.md']), createBrokenLink('z/b.md', ['y/b.md'])]);
    const view = createView();
    await openView(view);
    await view.recheck();

    const fixButton = getButton(view, 'Fix');
    const otherFixButton = getButton(view, 'Fix', 1);
    fixButton.click();
    otherFixButton.click();
    deferred.resolve([]);
    await waitForAllAsyncOperations();

    expect(fix).toHaveBeenCalledOnce();
  });

  it('should hide an ignored row until the next check', async () => {
    findBrokenLinks.mockResolvedValue([createBrokenLink('gone.md', [])]);
    const view = createView();
    await openView(view);
    await view.recheck();
    expect(view.contentEl.textContent).toContain('No candidate found (1)');

    getButton(view, 'Ignore').click();
    expect(view.contentEl.textContent).toContain('No broken links found.');

    await view.recheck();
    expect(view.contentEl.textContent).toContain('No candidate found (1)');
  });

  it('should open the source note at the link line', async () => {
    const note = await app.vault.create('note.md', '');
    const frontmatterReference: FrontmatterLinkCache = { displayText: 'x', key: 'related', link: 'x.md', original: '[[x.md]]' };
    findBrokenLinks.mockResolvedValue([
      createBrokenLink('a.md', []),
      createBrokenLink('x.md', [], { kind: BrokenLinkKind.FrontmatterLink, reference: frontmatterReference }),
      createBrokenLink('b.md', [], { sourcePath: 'deleted.md' })
    ]);
    const openFile = vi.fn<WorkspaceLeafOriginal['openFile']>(() => noopAsync());
    vi.spyOn(app.workspace, 'getLeaf').mockReturnValue(strictProxy<WorkspaceLeafOriginal>({ openFile }));
    const view = createView();
    await openView(view);
    await view.recheck();

    expect(view.contentEl.textContent).toContain('note.md (line 3)');
    expect(view.contentEl.textContent).toContain('note.md (property related)');

    getButton(view, 'Open source').click();
    getButton(view, 'Open source', 1).click();
    getButton(view, 'Open source', 2).click();
    await waitForAllAsyncOperations();

    /* eslint-disable unicorn/name-replacements -- Obsidian's `OpenViewState` names it. */
    expect(openFile).toHaveBeenCalledWith(note, { eState: { line: 2 } });
    expect(openFile).toHaveBeenCalledWith(note, { eState: { line: 0 } });
    /* eslint-enable unicorn/name-replacements -- Obsidian's `OpenViewState` names it. */
    expect(openFile).toHaveBeenCalledTimes(2);
  });

  it('should label a reference of no known kind with no location', async () => {
    findBrokenLinks.mockResolvedValue([createBrokenLink('a.md', [], { reference: castTo<Reference>({ link: 'a.md', original: 'a.md' }) })]);
    const view = createView();
    await openView(view);
    await view.recheck();
    expect(view.contentEl.textContent).toContain('note.md : a.md');
  });
});

describe('groupBrokenLinks', () => {
  it('should order the groups by kind, then by size, then by title', () => {
    const groups = groupBrokenLinks([
      createBrokenLink('found.md#x', [], { isTargetFound: true }),
      createBrokenLink('gone.md', []),
      createBrokenLink('a/x.md', ['b/x.md', 'c/x.md']),
      createBrokenLink('z/one.md', ['y/one.md']),
      createBrokenLink('old/a.md', ['new/a.md']),
      createBrokenLink('old/b.md', ['new/b.md']),
      createBrokenLink('m/one.md', ['n/one.md']),
      createBrokenLink('root.md', ['dir/root.md'])
    ]);

    expect(groups.map((group) => [group.kind, group.title, group.brokenLinks.length])).toStrictEqual([
      [BrokenLinkGroupKind.OneCandidate, '"old" is now "new"', 2],
      [BrokenLinkGroupKind.OneCandidate, '"m" is now "n"', 1],
      [BrokenLinkGroupKind.OneCandidate, '"z" is now "y"', 1],
      [BrokenLinkGroupKind.OneCandidate, 'the vault root is now "dir"', 1],
      [BrokenLinkGroupKind.SeveralCandidates, 'Several candidates: choose one', 1],
      [BrokenLinkGroupKind.NoCandidate, 'No candidate found', 1],
      [BrokenLinkGroupKind.MissingSubpath, 'The file exists, but not the heading or block', 1]
    ]);
  });
});

describe('openBrokenLinksView', () => {
  it('should reuse an open view and check again', async () => {
    const view = createView();
    const recheck = vi.spyOn(view, 'recheck').mockResolvedValue();
    const setViewState = vi.fn(() => noopAsync());
    const leaf = strictProxy<WorkspaceLeafOriginal>({ setViewState, view });
    vi.spyOn(app.workspace, 'getLeavesOfType').mockReturnValue([leaf]);
    const revealLeaf = vi.spyOn(app.workspace, 'revealLeaf').mockResolvedValue();

    await openBrokenLinksView(app);

    expect(setViewState).toHaveBeenCalledWith({ active: true, type: BROKEN_LINKS_VIEW_TYPE });
    expect(revealLeaf).toHaveBeenCalledWith(leaf);
    expect(recheck).toHaveBeenCalledOnce();
  });

  it('should open a new tab when none is open, and not check a view of another kind', async () => {
    const setViewState = vi.fn(() => noopAsync());
    const leaf = strictProxy<WorkspaceLeafOriginal>({ setViewState, view: {} });
    vi.spyOn(app.workspace, 'getLeavesOfType').mockReturnValue([]);
    const getLeaf = vi.spyOn(app.workspace, 'getLeaf').mockReturnValue(leaf);
    vi.spyOn(app.workspace, 'revealLeaf').mockResolvedValue();

    await openBrokenLinksView(app);

    expect(getLeaf).toHaveBeenCalledWith('tab');
    expect(setViewState).toHaveBeenCalledOnce();
  });
});
