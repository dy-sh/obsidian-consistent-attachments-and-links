/**
 * @file
 *
 * Desktop integration suite for bulk-operation commits: with `shouldCommitBulkOperations` on and the vault in a
 * git work tree, one run of `Fix incompatible paths` lands as `chore: before OP<n>` and `OP<n>: <summary>`, and
 * `git revert` of the second puts the vault back.
 *
 * The temporary vault is shared by every suite in the run and is not a git repository, so this suite makes it one
 * for its own duration and removes the `.git` folder afterwards. The config folder is ignored, so Obsidian's own config
 * writes cannot land in the operation's commit and then block the revert as local changes.
 *
 * The offender is the same as `path-compatibility.desktop.integration.test.ts`'s, for the same reason: a
 * 100-character CJK name is 300 UTF-8 bytes, over Android's limit, and still creatable on NTFS.
 */

import { sleep } from '@mnaoumov/typescript-lib/async';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

const PLUGIN_ID = 'consistent-attachments-and-links';
const COMMAND_ID = `${PLUGIN_ID}:fix-incompatible-paths`;
const LONG_CJK_BASENAME = '文'.repeat(100);
const COMMIT_WAIT_IN_MILLISECONDS = 60_000;
const POLL_INTERVAL_IN_MILLISECONDS = 250;

interface SetupResult {
  readonly folderPath: string;
  readonly previousSettings: null | Record<string, boolean>;
  readonly settingsFound: boolean;
  readonly sourcePath: string;
  readonly targetPath: string;
}

function git(vaultPath: string, gitArguments: readonly string[]): string {
  return execFileSync('git', [...gitArguments], { cwd: vaultPath, encoding: 'utf-8' }).trim();
}

async function waitForSubjects(vaultPath: string, isDone: (subjects: readonly string[]) => boolean): Promise<string[]> {
  const deadline = Date.now() + COMMIT_WAIT_IN_MILLISECONDS;
  for (;;) {
    const subjects = git(vaultPath, ['log', '--format=%s']).split('\n');
    if (isDone(subjects) || Date.now() > deadline) {
      return subjects;
    }
    await sleep({ milliseconds: POLL_INTERVAL_IN_MILLISECONDS });
  }
}

describe('Bulk operation commits', () => {
  it('commits one Fix incompatible paths run as two commits, and a revert of the second puts the vault back', async () => {
    const vaultPath = getTemporaryVault().path;
    const gitFolderPath = join(vaultPath, '.git');
    const gitIgnorePath = join(vaultPath, '.gitignore');
    expect(existsSync(gitFolderPath)).toBe(false);

    const configDirectory = await evalInObsidian({
      callback({ app }) {
        return app.vault.configDir;
      },
      input: {},
      vaultPath
    });

    git(vaultPath, ['init', '--quiet']);
    // Local identity and no hooks, so the commits do not depend on the machine's global git config.
    git(vaultPath, ['config', 'user.name', 'Integration Test']);
    git(vaultPath, ['config', 'user.email', 'integration-test@example.com']);
    git(vaultPath, ['config', 'core.hooksPath', '.git/no-hooks']);
    git(vaultPath, ['config', 'core.autocrlf', 'false']);
    writeFileSync(gitIgnorePath, `/${configDirectory}/\n`);
    git(vaultPath, ['add', '-A']);
    git(vaultPath, ['commit', '--quiet', '--allow-empty', '-m', 'initial']);

    let setup: null | SetupResult = null;
    try {
      setup = await evalInObsidian({
        async callback({ app, longBasename, pluginId }) {
          interface BulkOperationSettings {
            // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Tests turn the setting on for their own duration.
            shouldCommitBulkOperations: boolean;
            // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Tests change this setting between scenarios to verify each configured behavior.
            shouldEnsurePathCompatibilityOnAndroid: boolean;
            // eslint-disable-next-line typescript-dev-toolkit/readonly-interface-members -- Tests change this setting between scenarios to verify each configured behavior.
            shouldEnsurePathCompatibilityOnWindows: boolean;
          }

          function isBulkOperationSettings(value: unknown): value is BulkOperationSettings {
            return typeof value === 'object' && value !== null
              && typeof (value as Record<string, unknown>)['shouldCommitBulkOperations'] === 'boolean';
          }

          // The same walk as `path-compatibility.desktop.integration.test.ts`: the live settings object the
          // command reads, so a change needs no reload.
          function findSettings(): BulkOperationSettings | null {
            const block = new Set(['app', 'containerEl', 'dom', 'metadataCache', 'plugins', 'vault', 'workspace']);
            const seen = new Set<unknown>();
            const queue: unknown[] = [app.plugins.getPlugin(pluginId)];
            let budget = 12_000;
            while (queue.length > 0 && budget-- > 0) {
              const current = queue.shift();
              if (current === null || (typeof current !== 'object' && typeof current !== 'function') || seen.has(current)) {
                continue;
              }
              seen.add(current);
              const record = current as Record<string, unknown>;
              if (isBulkOperationSettings(record['settings'])) {
                return record['settings'];
              }
              let values: unknown[] = [];
              if (Array.isArray(current)) {
                values = current;
              } else if (current instanceof Map) {
                values = [...current.values()];
              } else {
                for (const [key, value] of Object.entries(record)) {
                  if (!block.has(key)) {
                    values.push(value);
                  }
                }
              }
              for (const value of values) {
                if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
                  queue.push(value);
                }
              }
            }
            return null;
          }

          const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
          const folderPath = `bulk-operation-commit-${stamp}`;
          const targetPath = `${folderPath}/${longBasename}.md`;
          const sourcePath = `${folderPath}/source.md`;

          const settings = findSettings();
          if (!settings) {
            return { folderPath, previousSettings: null, settingsFound: false, sourcePath, targetPath };
          }

          const previousSettings: Record<string, boolean> = {
            shouldCommitBulkOperations: settings.shouldCommitBulkOperations,
            shouldEnsurePathCompatibilityOnAndroid: settings.shouldEnsurePathCompatibilityOnAndroid,
            shouldEnsurePathCompatibilityOnWindows: settings.shouldEnsurePathCompatibilityOnWindows
          };
          settings.shouldCommitBulkOperations = true;
          settings.shouldEnsurePathCompatibilityOnAndroid = true;
          settings.shouldEnsurePathCompatibilityOnWindows = false;

          await app.vault.createFolder(folderPath);
          await app.vault.create(targetPath, '# Target\n');
          await app.vault.create(sourcePath, `# Source\n\n[target](<${longBasename}.md>)\n`);
          return { folderPath, previousSettings, settingsFound: true, sourcePath, targetPath };
        },
        input: { longBasename: LONG_CJK_BASENAME, pluginId: PLUGIN_ID },
        vaultPath
      });
      expect(setup.settingsFound).toBe(true);

      await evalInObsidian({
        callback({ app, commandId }) {
          app.commands.executeCommandById(commandId);
        },
        input: { commandId: COMMAND_ID },
        vaultPath
      });

      // The commit is made after the vault settles, so wait for it in the history rather than for the command.
      const subjects = await waitForSubjects(vaultPath, (current) => current.some((subject) => /^OP\d+: /.test(subject)));
      const operationSubject = subjects.find((subject) => /^OP\d+: /.test(subject));
      expect(operationSubject).toMatch(/^OP\d+: Fix incompatible paths in the entire vault$/);
      const operationId = operationSubject?.split(':', 1)[0] ?? '';
      expect(subjects.slice(0, 2)).toStrictEqual([`${operationId}: Fix incompatible paths in the entire vault`, `chore: before ${operationId}`]);
      expect(git(vaultPath, ['log', '-1', '--format=%(trailers:key=Obsidian-Plugin,valueonly)'])).toBe(PLUGIN_ID);

      // The operation renamed the note and rewrote the link to it.
      const targetFullPath = join(vaultPath, setup.targetPath);
      const sourceFullPath = join(vaultPath, setup.sourcePath);
      const originalSource = `# Source\n\n[target](<${LONG_CJK_BASENAME}.md>)\n`;
      expect(existsSync(targetFullPath)).toBe(false);
      expect(readFileSync(sourceFullPath, 'utf-8')).not.toBe(originalSource);
      expect(git(vaultPath, ['status', '--porcelain'])).toBe('');

      git(vaultPath, ['revert', '--no-edit', 'HEAD']);

      expect(existsSync(targetFullPath)).toBe(true);
      expect(readFileSync(targetFullPath, 'utf-8')).toBe('# Target\n');
      expect(readFileSync(sourceFullPath, 'utf-8')).toBe(originalSource);
      // HEAD~2 is chore: before OP<n>: the tree is back to it.
      expect(git(vaultPath, ['diff', '--stat', 'HEAD~2', 'HEAD'])).toBe('');
    } finally {
      await evalInObsidian({
        async callback({ app, folderPath, pluginId, previousSettings }) {
          const plugin = app.plugins.getPlugin(pluginId) as unknown;
          const seen = new Set<unknown>();
          const queue: unknown[] = [plugin];
          while (queue.length > 0) {
            const current = queue.shift();
            if (current === null || typeof current !== 'object' || seen.has(current) || seen.size > 12_000) {
              continue;
            }
            seen.add(current);
            const settings = (current as Record<string, unknown>)['settings'];
            if (typeof settings === 'object' && settings !== null && 'shouldCommitBulkOperations' in settings) {
              Object.assign(settings, previousSettings ?? { shouldCommitBulkOperations: false });
              break;
            }
            for (const [key, value] of Object.entries(current as Record<string, unknown>)) {
              if (!['app', 'containerEl', 'dom', 'metadataCache', 'plugins', 'vault', 'workspace'].includes(key)) {
                queue.push(value);
              }
            }
          }

          const folder = folderPath === null ? null : app.vault.getFolderByPath(folderPath);
          if (folder) {
            await app.fileManager.trashFile(folder);
          }
        },
        input: { folderPath: setup?.folderPath ?? null, pluginId: PLUGIN_ID, previousSettings: setup?.previousSettings ?? null },
        vaultPath
      });
      rmSync(gitFolderPath, { force: true, maxRetries: 5, recursive: true });
      rmSync(gitIgnorePath, { force: true });
    }
  });
});
