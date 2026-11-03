import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import { createDesktopGitRunner } from './desktop-git-runner.ts';

interface ExecFileResult {
  readonly stdout: string;
}

const hoisted = vi.hoisted(() => ({
  execFile: vi.fn()
}));

vi.mock('node:child_process', () => ({
  execFile: hoisted.execFile
}));

describe('createDesktopGitRunner', () => {
  it('should run git in the folder and answer its standard output', async () => {
    hoisted.execFile.mockImplementation((_file: string, _arguments: string[], _options: unknown, callback: (error: Error | null, result: ExecFileResult) => void) => {
      callback(null, { stdout: 'output' });
    });

    const output = await createDesktopGitRunner({ cwd: 'C:/vault', execFile, promisify })(['status']);

    expect(output).toBe('output');
    expect(hoisted.execFile).toHaveBeenCalledWith('git', ['status'], expect.objectContaining({ cwd: 'C:/vault', windowsHide: true }), expect.any(Function));
  });
});
