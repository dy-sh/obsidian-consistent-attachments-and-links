import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { GitRunner } from './git-rename-history.ts';

/**
 * Large enough for the rename history of any vault: `--diff-filter=R` keeps only the renames. 256 MiB.
 */
const GIT_OUTPUT_LIMIT_IN_BYTES = 268_435_456;

const execFileAsync = promisify(execFile);

/**
 * Creates a {@link GitRunner} for a folder.
 *
 * Desktop only: this module imports `node:child_process`, so it is loaded by a dynamic `import()` behind
 * `Platform.isDesktopApp`.
 *
 * @param cwd - The folder to run `git` in.
 * @returns The runner.
 */
export function createDesktopGitRunner(cwd: string): GitRunner {
  return async (arguments_) => {
    const { stdout } = await execFileAsync('git', [...arguments_], { cwd, encoding: 'utf-8', maxBuffer: GIT_OUTPUT_LIMIT_IN_BYTES, windowsHide: true });
    return stdout;
  };
}
