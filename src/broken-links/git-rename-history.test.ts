import { noopAsync } from '@mnaoumov/typescript-lib/function';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  loadGitRenames,
  parseGitRenameLog
} from './git-rename-history.ts';

// The shape `git log -z --diff-filter=R -M --name-status --format=%h` prints, newest commit first.
const LOG = [
  'c3',
  '\nR100',
  'vault/b/n.md',
  'vault/b/м н.md',
  'c2',
  '\nR090',
  'vault/a/n.md',
  'vault/b/n.md',
  'R100',
  'outside/x.md',
  'vault/x.md',
  'c1',
  '\nR100',
  'vault/z.md',
  'vault/y.md',
  ''
].join('\0');

describe('parseGitRenameLog', () => {
  it('should follow a chain of renames to its end, inside the vault folder only', () => {
    expect(parseGitRenameLog(LOG, 'vault/')).toStrictEqual(
      new Map([
        ['a/n.md', { commit: 'c3', newPath: 'b/м н.md' }],
        ['b/n.md', { commit: 'c3', newPath: 'b/м н.md' }],
        ['z.md', { commit: 'c1', newPath: 'y.md' }]
      ])
    );
  });

  it('should let a later rename of a path win, and stop on a cycle', () => {
    const log = ['c3', '\nR100', 'b.md', 'a.md', 'c2', '\nR100', 'a.md', 'b.md', 'c1', '\nR100', 'a.md', 'c.md'].join('\0');
    expect(parseGitRenameLog(log, '')).toStrictEqual(
      new Map([
        ['a.md', { commit: 'c3', newPath: 'a.md' }],
        ['b.md', { commit: 'c2', newPath: 'b.md' }]
      ])
    );
  });

  it('should tolerate a truncated record', () => {
    expect(parseGitRenameLog('c1\0R100', '')).toStrictEqual(new Map([['', { commit: 'c1', newPath: '' }]]));
  });
});

describe('loadGitRenames', () => {
  it('should read the vault prefix and the rename log through the runner', async () => {
    const runGit = vi.fn(async (arguments_: readonly string[]): Promise<string> => {
      await noopAsync();
      return arguments_[0] === 'rev-parse' ? 'vault/\n' : LOG;
    });
    const renames = await loadGitRenames({ runGit });
    expect(renames.get('z.md')).toStrictEqual({ commit: 'c1', newPath: 'y.md' });
    expect(runGit).toHaveBeenCalledWith(['-c', 'core.quotePath=false', 'log', '-z', '--diff-filter=R', '-M', '--name-status', '--format=%h']);
  });

  it('should answer no renames when git cannot run', async () => {
    const runGit = vi.fn(async (): Promise<string> => {
      await noopAsync();
      throw new Error('not a git repository');
    });
    expect(await loadGitRenames({ runGit })).toStrictEqual(new Map());
  });
});
