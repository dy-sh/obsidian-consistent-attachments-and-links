/**
 * @file
 *
 * Desktop integration suite for the 4.x collect settings hand-over.
 *
 * The same seam `rename-delete-migration.desktop.integration.test.ts` covers for 4.0.0's handover, for the
 * settings that left in 5.0.0: a REAL `data.json` written by a 4.x install, loaded by a real plugin in a real
 * Obsidian, and saved back. `obsidian-dev-utils` rebuilds the saved record from the DECLARED properties alone,
 * so a property this plugin has dropped is stripped on the first save; if the converter did not park it
 * first, the user's collect settings are gone before Custom Attachment Location is ever installed to receive
 * them.
 *
 * It also covers what the rename/delete suite does not: that the offer is ONE-SHOT. The parked keys have all
 * left `PluginSettings`, so once they are stripped no later load can park them again, and a retired offer
 * stays retired across a reload. A key that stayed declared would be re-parked on every load and bring an
 * applied migration back forever.
 *
 * Only this plugin is involved. The dialog that reviews the proposal belongs to Custom Attachment Location and
 * is covered by its own `plugin-api-migrate-settings` suite.
 */

import { evalInObsidian } from 'obsidian-integration-testing';
import {
  describe,
  expect,
  it
} from 'vitest';

const PLUGIN_ID = 'consistent-attachments-and-links';

// Exactly what a 4.x install leaves behind: the six collect settings this plugin owned until 5.0.0.
const DATA_4X = JSON.stringify({
  attachmentUnitFolderPaths: ['assets/page_files'],
  collectAttachmentUsedByMultipleNotesMode: 'Copy',
  consistencyReportFile: 'consistency-report.md',
  excludePathsFromAttachmentCollecting: ['archive'],
  moveAttachmentToProperFolderUsedByMultipleNotesMode: 'Prompt',
  shouldAddCommandsToFileMenu: false,
  shouldCollectAttachmentsAutomatically: true,
  shouldShowBackupWarning: false
});

const DROPPED_KEYS = [
  'attachmentUnitFolderPaths',
  'collectAttachmentUsedByMultipleNotesMode',
  'excludePathsFromAttachmentCollecting',
  'moveAttachmentToProperFolderUsedByMultipleNotesMode',
  'shouldAddCommandsToFileMenu',
  'shouldCollectAttachmentsAutomatically'
];

interface ReloadInput {
  /**
   * Written to `data.json` before the reload. `null` removes the file; `undefined` leaves it alone.
   */
  readonly dataToWrite?: null | string;

  /**
   * Whether to force a save after the load, read the record back, and then retire the proposal the way
   * `SettingsMigrationComponent` does once the user applies it.
   */
  readonly shouldSaveAndRetire: boolean;
}

interface ReloadResult {
  readonly proposedAfterLoad: unknown;
  readonly savedRecord: null | Record<string, unknown>;
}

/**
 * Reloads the plugin once, which is what makes a written `data.json` real: the plugin read its settings when
 * the vault opened. One reload per closure, so each stays under the transport's per-closure cap.
 *
 * @param input - What to write first and what to do after the load.
 * @returns The proposal the load produced, and the record the forced save left on disk.
 */
async function reloadPlugin(input: ReloadInput): Promise<ReloadResult> {
  return await evalInObsidian({
    async callback({ app, lib: { waitUntil }, pluginId, reloadInput }) {
      interface PluginSettingsComponentLike {
        editAndSave: (settingsEditor: (settings: Record<string, unknown>) => void) => Promise<void>;
        readonly settings: Record<string, unknown>;
      }

      interface PluginWithSettingsComponent {
        readonly pluginSettingsComponent: PluginSettingsComponentLike;
      }

      const RELOAD_TIMEOUT_IN_MILLISECONDS = 20_000;
      const dataPath = `.obsidian/plugins/${pluginId}/data.json`;

      if (reloadInput.dataToWrite === null) {
        if (await app.vault.adapter.exists(dataPath)) {
          await app.vault.adapter.remove(dataPath);
        }
      } else if (reloadInput.dataToWrite !== undefined) {
        await app.vault.adapter.write(dataPath, reloadInput.dataToWrite);
      }

      await app.plugins.disablePlugin(pluginId);
      await app.plugins.enablePlugin(pluginId);

      await waitUntil({
        message: 'the plugin to register its commands again',
        predicate: () => Object.hasOwn(app.commands.commands, `${pluginId}:check-consistency`),
        timeoutInMilliseconds: RELOAD_TIMEOUT_IN_MILLISECONDS
      });

      // `getPlugin` is typed as Obsidian's `Plugin`, which knows nothing of this plugin's own members, so the
      // handle is taken as `unknown` and narrowed once.
      const pluginHandle: unknown = app.plugins.getPlugin(pluginId);
      if (!pluginHandle) {
        throw new Error(`Plugin is not loaded: ${pluginId}`);
      }
      const settingsComponent = (pluginHandle as PluginWithSettingsComponent).pluginSettingsComponent;
      const proposedAfterLoad = settingsComponent.settings['proposedCollectSettings'];

      if (!reloadInput.shouldSaveAndRetire) {
        return { proposedAfterLoad, savedRecord: null };
      }

      // Force the save that rebuilds the record from the declared properties — the moment a dropped property
      // would vanish from disk.
      await settingsComponent.editAndSave(() => {
        // Nothing to change; the save itself is the subject.
      });
      const savedRecord = JSON.parse(await app.vault.adapter.read(dataPath)) as Record<string, unknown>;

      await settingsComponent.editAndSave((settings) => {
        settings['proposedCollectSettings'] = null;
      });

      return { proposedAfterLoad, savedRecord };
    },
    input: { pluginId: PLUGIN_ID, reloadInput: input }
  });
}

describe('The 4.x collect settings hand-over', () => {
  it('parks a real data.json\'s collect values, strips them on save, and does not re-park after a retirement', async () => {
    // Put back afterwards: later files in the run load this plugin with whatever is left on disk.
    const originalData = await evalInObsidian({
      async callback({ app, pluginId }) {
        const dataPath = `.obsidian/plugins/${pluginId}/data.json`;
        return await app.vault.adapter.exists(dataPath) ? await app.vault.adapter.read(dataPath) : null;
      },
      input: { pluginId: PLUGIN_ID }
    });

    try {
      const handover = await reloadPlugin({ dataToWrite: DATA_4X, shouldSaveAndRetire: true });
      const afterRetirement = await reloadPlugin({ shouldSaveAndRetire: false });

      // `shouldAddCommandsToFileMenu` is not proposed: Custom Attachment Location has no toggle for it.
      const expectedProposal = {
        attachmentUnitFolderPaths: ['assets/page_files'],
        collectAttachmentUsedByMultipleNotesMode: 'Copy',
        excludePathsFromAttachmentCollecting: ['archive'],
        moveAttachmentToProperFolderUsedByMultipleNotesMode: 'Prompt',
        shouldCollectAttachmentsAutomatically: true
      };

      expect(handover.proposedAfterLoad).toStrictEqual(expectedProposal);
      // The values outlive the save that strips the properties they came from.
      expect(handover.savedRecord?.['proposedCollectSettings']).toStrictEqual(expectedProposal);
      expect(DROPPED_KEYS.filter((key) => Object.hasOwn(handover.savedRecord ?? {}, key))).toStrictEqual([]);
      // And a retired offer stays retired: nothing is left on disk to park again.
      expect(afterRetirement.proposedAfterLoad).toBeNull();
    } finally {
      await reloadPlugin({ dataToWrite: originalData, shouldSaveAndRetire: false });
    }
  });
});
