/**
 * @file
 *
 * The renames a vault's git history records, the strongest evidence of where a missing link target went.
 *
 * Cross-platform: it only parses. Running `git` is `desktop-git-runner.ts`'s, which imports `node:child_process`,
 * so it is loaded by a dynamic `import()` behind `Platform.isDesktopApp` and the mobile bundle never evaluates it.
 */

import type { GitRename } from './broken-link-candidates.ts';

/**
 * Runs `git` with the given arguments in the vault's folder.
 *
 * @param arguments_ - The arguments.
 * @returns The command's standard output.
 */
export type GitRunner = (arguments_: readonly string[]) => Promise<string>;

/**
 * The parameters for {@link loadGitRenames}.
 */
export interface LoadGitRenamesParams {
  /**
   * Runs `git` in the vault's folder.
   */
  readonly runGit: GitRunner;
}

interface RecordedRename extends GitRename {
  readonly oldPath: string;
}

const RENAME_STATUS_REGEXP = /^R\d*$/;

/**
 * Reads every rename in the git history of the repository the vault lives in.
 *
 * @param params - The parameters.
 * @returns Each old vault path to the path it ended up at; empty when the vault is not in a git repository or
 * `git` cannot run, because missing evidence is not an error.
 */
export async function loadGitRenames(params: LoadGitRenamesParams): Promise<Map<string, GitRename>> {
  try {
    const showPrefixOutput = await params.runGit(['rev-parse', '--show-prefix']);
    const vaultPrefix = showPrefixOutput.trim();
    const log = await params.runGit(['-c', 'core.quotePath=false', 'log', '-z', '--diff-filter=R', '-M', '--name-status', '--format=%h']);
    return parseGitRenameLog(log, vaultPrefix);
  } catch {
    return new Map();
  }
}

/**
 * Parses the output of `git log -z --diff-filter=R -M --name-status --format=%h`.
 *
 * @param log - The output, newest commit first.
 * @param vaultPrefix - The vault's folder within the repository, as `git rev-parse --show-prefix` prints it:
 * `''` or a path ending in `/`. Renames outside it are dropped, and it is stripped from the rest.
 * @returns Each old vault path to the path it ended up at, following a chain of renames to its end.
 */
export function parseGitRenameLog(log: string, vaultPrefix: string): Map<string, GitRename> {
  const tokens = log.split('\0').map((token) => token.replace(/^\n+/, ''));
  const renames: RecordedRename[] = [];
  let commit = '';

  let index = 0;
  function readToken(): string {
    return tokens[index++] ?? '';
  }

  while (index < tokens.length) {
    const token = readToken();
    if (RENAME_STATUS_REGEXP.test(token)) {
      const oldPath = readToken();
      const newPath = readToken();
      if (oldPath.startsWith(vaultPrefix) && newPath.startsWith(vaultPrefix)) {
        renames.push({ commit, newPath: newPath.slice(vaultPrefix.length), oldPath: oldPath.slice(vaultPrefix.length) });
      }
    } else if (token) {
      commit = token;
    }
  }

  // Oldest first, so a later rename of the same path overrides an earlier one.
  const nextByPath = new Map<string, GitRename>();
  for (const rename of renames.reverse()) {
    nextByPath.set(rename.oldPath, { commit: rename.commit, newPath: rename.newPath });
  }

  const result = new Map<string, GitRename>();
  for (const [oldPath, firstRename] of nextByPath) {
    let rename = firstRename;
    const visitedPaths = new Set([oldPath]);
    let next = nextByPath.get(rename.newPath);
    while (next && !visitedPaths.has(rename.newPath)) {
      visitedPaths.add(rename.newPath);
      rename = next;
      next = nextByPath.get(rename.newPath);
    }
    result.set(oldPath, rename);
  }

  return result;
}
