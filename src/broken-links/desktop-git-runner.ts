import type { GitRunner } from '@mnaoumov/obsidian-lib/git-rename-history';

/**
 * Desktop dependencies supplied only after the caller's platform guard.
 */
export interface CreateDesktopGitRunnerParams {
  /**
   * The folder to run `git` in.
   */
  readonly cwd: string;
  /**
   * Node's process launcher.
   */
  readonly execFile: typeof import('node:child_process').execFile;
  /**
   * Node's callback-to-promise adapter.
   */
  readonly promisify: typeof import('node:util').promisify;
}

/**
 * Large enough for the rename history of any vault: `--diff-filter=R` keeps only the renames. 256 MiB.
 */
const GIT_OUTPUT_LIMIT_IN_BYTES = 268_435_456;

/**
 * Creates a {@link GitRunner} for a folder.
 *
 * The caller loads Node dependencies with `require()` behind `Platform.isDesktop` and injects them.
 *
 * @param params - The folder and desktop dependencies.
 * @returns The runner.
 */
export function createDesktopGitRunner(params: CreateDesktopGitRunnerParams): GitRunner {
  const { cwd, execFile, promisify } = params;
  const execFileAsync = promisify(execFile);
  return async (arguments_) => {
    const { stdout } = await execFileAsync('git', [...arguments_], { cwd, encoding: 'utf-8', maxBuffer: GIT_OUTPUT_LIMIT_IN_BYTES, windowsHide: true });
    return stdout;
  };
}
