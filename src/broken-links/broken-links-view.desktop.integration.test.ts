/**
 * @file
 *
 * `Fix broken links`: a folder renamed outside Obsidian breaks every link into it, and the view repairs them.
 *
 * The staging is the case the feature was built for: `alpha/bravo/charlie/` became `alpha/bravo/delta/`, so the
 * links to its folder note and to its other note lead nowhere. The view must group both under one mapping, and
 * one trusted click on `Fix all like this` must rewrite exactly their paths, keeping each link's style and alias.
 * A link to a file that exists nowhere is the control: it must stay listed with no candidate, and stay untouched.
 *
 * Desktop-only (the file name alone picks the project): the trusted click goes through Electron.
 */

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  rmSync
} from 'node:fs';
import { join } from 'node:path';
import { evalInObsidian } from 'obsidian-integration-testing';
import { getTemporaryVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

const COMMAND_ID = 'consistent-attachments-and-links:fix-broken-links';
const VIEW_TYPE = 'consistent-attachments-and-links-broken-links';

// The closure declares four waits, so this is charged four times against the transport's ~30 s per-closure cap.
const WAIT_TIMEOUT_IN_MILLISECONDS = 5000;

interface ProbeResult {
  readonly contentAfterFix: string;
  readonly groupTitles: string[];
  readonly viewTextAfterFix: string;
}

describe('Fix broken links view', () => {
  it('finds a renamed target from git history in the desktop renderer', async () => {
    const vaultPath = getTemporaryVault().path;
    const gitPath = join(vaultPath, '.git');
    expect(existsSync(gitPath)).toBe(false);
    function git(arguments_: readonly string[]): void {
      execFileSync('git', [...arguments_], { cwd: vaultPath, windowsHide: true });
    }
    git(['init', '--quiet']);
    git(['config', 'user.name', 'Integration Test']);
    git(['config', 'user.email', 'integration-test@example.com']);
    git(['config', 'core.hooksPath', '.git/no-hooks']);
    git(['config', 'core.autocrlf', 'false']);
    const probeFolder = 'git-candidate-probe';
    try {
      await evalInObsidian({
        async callback({ app, folder }) {
          await app.vault.createFolder(folder);
          await app.vault.create(`${folder}/old.md`, 'A unique note whose new name has no other matching evidence.\n');
        },
        input: { folder: probeFolder },
        vaultPath
      });
      git(['add', '--', `${probeFolder}/old.md`]);
      git(['commit', '--quiet', '-m', 'initial']);
      await evalInObsidian({
        async callback({ app, folder }) {
          await app.vault.adapter.rename(`${folder}/old.md`, `${folder}/new.md`);
          await app.vault.create(`${folder}/source.md`, '[Old](old.md)\n');
        },
        input: { folder: probeFolder },
        vaultPath
      });
      git(['add', '-A', '--', probeFolder]);
      git(['commit', '--quiet', '-m', 'rename']);
      const viewText = await evalInObsidian({
        async callback({ app, commandId, folder, lib: { waitUntil }, viewType }) {
          await waitUntil({ predicate: () => app.vault.getFileByPath(`${folder}/new.md`) !== null });
          app.commands.executeCommandById(commandId);
          await waitUntil({
            predicate: () => {
              const text = app.workspace.getLeavesOfType(viewType)[0]?.view.containerEl.textContent ?? '';
              return text.includes(`${folder}/source.md`) && text.includes('[Old](old.md)');
            }
          });
          return app.workspace.getLeavesOfType(viewType)[0]?.view.containerEl.textContent ?? '';
        },
        input: { commandId: COMMAND_ID, folder: probeFolder, viewType: VIEW_TYPE },
        vaultPath
      });
      expect(viewText).toContain(`${probeFolder}/new.md`);
      expect(viewText).toContain('Git history records the rename, in commit');
    } finally {
      await evalInObsidian({
        async callback({ app, folder, viewType }) {
          app.workspace.detachLeavesOfType(viewType);
          const existing = app.vault.getAbstractFileByPath(folder);
          if (existing) {
            await app.fileManager.trashFile(existing);
          }
        },
        input: { folder: probeFolder, viewType: VIEW_TYPE },
        vaultPath
      });
      rmSync(gitPath, { force: true, recursive: true });
    }
  }, 180_000);

  it('repairs every link into a renamed folder with one click, and leaves a link with no candidate alone', async () => {
    const result = await evalInObsidian({
      async callback({
        app,
        commandId,
        lib: { clickElement, waitUntil },
        viewType,
        waitTimeoutInMilliseconds
      }): Promise<ProbeResult> {
        const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
        const folder = `blv-${stamp}`;
        const oldFolder = `${folder}/alpha/bravo/charlie`;
        const newFolder = `${folder}/alpha/bravo/delta`;
        const groupTitle = `"${oldFolder}" is now "${newFolder}" (2)`;

        function getViewEl(): HTMLElement | null {
          return app.workspace.getLeavesOfType(viewType)[0]?.view.containerEl ?? null;
        }

        function findGroupHeader(): HTMLElement | null {
          const headers = [...getViewEl()?.querySelectorAll<HTMLElement>('.consistent-attachments-and-links-broken-links-group-header') ?? []];
          return headers.find((header) => header.querySelector('h4')?.textContent === groupTitle) ?? null;
        }

        // A trusted click lands on whatever is on top, and this plugin's one-time backup warning is a dialog over the
        // whole window until someone closes it.
        async function dismissDialogs(): Promise<void> {
          // Earlier suites reload this plugin, so several warnings can be stacked; close the top one until none is left.
          await waitUntil({
            message: `a dialog stayed open over the view: ${document.querySelector('.modal-container')?.textContent.slice(0, 120) ?? ''}`,
            predicate: async () => {
              const buttons = [...document.querySelectorAll<HTMLElement>('.modal-container button.mod-cta, .modal-container .modal-close-button')];
              const button = buttons.at(-1);
              if (!button) {
                return true;
              }
              await clickElement({ element: button });
              return false;
            },
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });
        }

        try {
          await app.vault.createFolder(newFolder);
          await app.vault.create(`${newFolder}/!.md`, 'Folder note\n');
          await app.vault.create(`${newFolder}/child.md`, 'Child\n');
          const source = await app.vault.create(
            `${folder}/source.md`,
            '[C](alpha/bravo/charlie/!.md)\n\n[[alpha/bravo/charlie/child.md|Child]]\n\n[Gone](nowhere/gone.md)\n'
          );

          await waitUntil({
            message: 'the staged links were not indexed',
            predicate: () => (app.metadataCache.getFileCache(source)?.links?.length ?? 0) === 3,
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });

          app.commands.executeCommandById(commandId);
          await waitUntil({
            message: 'the view did not list the renamed folder\'s links',
            predicate: () => Boolean(findGroupHeader()),
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });

          const groupTitles = [...getViewEl()?.querySelectorAll('h4') ?? []].map((element) => element.textContent);
          const button = [...findGroupHeader()?.querySelectorAll('button') ?? []].find((element) => element.textContent === 'Fix all like this');
          if (!button) {
            throw new Error('The group has no Fix all like this button');
          }
          await dismissDialogs();
          button.scrollIntoView();
          await clickElement({ element: button });

          await waitUntil({
            message: 'the links were not rewritten',
            predicate: async () => {
              const content = await app.vault.read(source);
              return content.includes('[[alpha/bravo/delta/child.md|Child]]');
            },
            timeoutInMilliseconds: waitTimeoutInMilliseconds
          });

          return {
            contentAfterFix: await app.vault.read(source),
            groupTitles,
            viewTextAfterFix: getViewEl()?.textContent ?? ''
          };
        } finally {
          app.workspace.detachLeavesOfType(viewType);
          const existing = app.vault.getAbstractFileByPath(folder);
          if (existing) {
            await app.fileManager.trashFile(existing);
          }
        }
      },
      input: {
        commandId: COMMAND_ID,
        viewType: VIEW_TYPE,
        waitTimeoutInMilliseconds: WAIT_TIMEOUT_IN_MILLISECONDS
      },
      vaultPath: getTemporaryVault().path
    });

    // Other suites share the vault, so the control's group may hold their links too: only its presence is asserted.
    expect(result.groupTitles.some((title) => title.startsWith('No candidate found'))).toBe(true);
    expect(result.contentAfterFix).toBe('[C](alpha/bravo/delta/!.md)\n\n[[alpha/bravo/delta/child.md|Child]]\n\n[Gone](nowhere/gone.md)\n');
    expect(result.viewTextAfterFix).toContain('[Gone](nowhere/gone.md)');
    expect(result.viewTextAfterFix).not.toContain('alpha/bravo/charlie');
  }, 180_000);
});
