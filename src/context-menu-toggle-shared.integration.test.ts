/**
 * @file
 *
 * Shared integration suite for the `shouldAddCommandsToFileMenu` setting (issue #153): the toggle that
 * adds/removes the plugin's `Collect attachments in file` and `Move attachment to proper folder`
 * commands from the file/folder context menu.
 *
 * It drives the REAL menu flow — firing Obsidian's `file-menu` workspace event (the exact event the
 * File Explorer raises on a right-click) against a real `Menu`, which invokes the plugin's registered
 * menu handlers — and asserts the plugin's items are PRESENT when the setting is on and ABSENT when it
 * is off. A note exercises the `Collect attachments` handler and a `.png` attachment exercises the
 * `Move attachment to proper folder` handler (each command's own `canExecute` gate decides which file
 * it applies to). The commands stay in the command palette regardless (not asserted here).
 *
 * This file is named `*-shared.integration.test.ts` (per G47) so it is excluded from unit collection
 * and coverage and is matched by no `*.desktop`/`*.android` project glob — it runs only when imported
 * by a platform entry point.
 */

import type {
  MenuItem,
  TAbstractFile
} from 'obsidian';

import { evalInObsidian } from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  describe,
  expect,
  it
} from 'vitest';

const PLUGIN_ID = 'consistent-attachments-and-links';
const COLLECT_ITEM_TITLE = 'Collect attachments in file';
const MOVE_ITEM_TITLE = 'Move attachment to proper folder';

/**
 * Registers the context-menu command toggle integration test for the given platform.
 *
 * @param platform - Human-readable platform label used in the test name (e.g. `'desktop'`).
 */
export function registerContextMenuToggleSuite(platform: string): void {
  describe(`Context-menu command toggle (issue #153) [${platform}]`, () => {
    it('adds the file/folder menu commands only while shouldAddCommandsToFileMenu is on', async () => {
      const result = await evalInObsidian({
        args: {
          collectItemTitle: COLLECT_ITEM_TITLE,
          moveItemTitle: MOVE_ITEM_TITLE,
          pluginId: PLUGIN_ID
        },
        async fn({
          app,
          collectItemTitle,
          moveItemTitle,
          obsidianModule,
          pluginId
        }) {
          interface ContextMenuSettings {
            shouldAddCommandsToFileMenu: boolean;
          }

          function isContextMenuSettings(value: unknown): value is ContextMenuSettings {
            return typeof value === 'object' && value !== null
              && typeof (value as Record<string, unknown>)['shouldAddCommandsToFileMenu'] === 'boolean';
          }

          // Walk the plugin's object graph to reach the live effective-settings object the menu
          // Handlers read; mutating it changes what the next menu open produces (no reload needed).
          function findSettings(): ContextMenuSettings | null {
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
              if (isContextMenuSettings(record['settings'])) {
                return record['settings'];
              }
              let values: unknown[] = [];
              if (Array.isArray(current)) {
                values = current;
              } else if (current instanceof Map) {
                values = Array.from(current.values());
              } else {
                for (const key of Object.keys(record)) {
                  if (!block.has(key)) {
                    values.push(record[key]);
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

          const settings = findSettings();
          if (!settings) {
            return {
              collectPresentOff: true,
              collectPresentOn: false,
              movePresentOff: true,
              movePresentOn: false,
              settingsFound: false
            };
          }

          const stamp = `${Date.now().toString()}-${Math.floor(performance.now()).toString()}`;
          const notePath = `ctx-note-${stamp}.md`;
          const attachmentPath = `ctx-image-${stamp}.png`;
          const note = await app.vault.create(notePath, '# Note\n');
          const attachment = await app.vault.createBinary(attachmentPath, new ArrayBuffer(4));

          function menuItemTitles(file: TAbstractFile): string[] {
            const menu = new obsidianModule.Menu();
            app.workspace.trigger('file-menu', menu, file, 'file-explorer-context-menu');
            return menu.items
              .filter((item): item is MenuItem => 'titleEl' in item)
              .map((item) => item.titleEl.textContent);
          }

          settings.shouldAddCommandsToFileMenu = true;
          const noteTitlesOn = menuItemTitles(note);
          const attachmentTitlesOn = menuItemTitles(attachment);

          settings.shouldAddCommandsToFileMenu = false;
          const noteTitlesOff = menuItemTitles(note);
          const attachmentTitlesOff = menuItemTitles(attachment);

          // Restore the default so a later suite sharing this instance sees the shipped behavior.
          settings.shouldAddCommandsToFileMenu = true;

          await app.fileManager.trashFile(note);
          await app.fileManager.trashFile(attachment);

          return {
            collectPresentOff: noteTitlesOff.includes(collectItemTitle),
            collectPresentOn: noteTitlesOn.includes(collectItemTitle),
            movePresentOff: attachmentTitlesOff.includes(moveItemTitle),
            movePresentOn: attachmentTitlesOn.includes(moveItemTitle),
            settingsFound: true
          };
        },
        vaultPath: getTempVault().path
      });

      expect(result.settingsFound).toBe(true);

      // On (default): the plugin's commands appear on their applicable file/folder context menus.
      expect(result.collectPresentOn).toBe(true);
      expect(result.movePresentOn).toBe(true);

      // Off: neither command is added to the context menu.
      expect(result.collectPresentOff).toBe(false);
      expect(result.movePresentOff).toBe(false);
    });
  });
}
