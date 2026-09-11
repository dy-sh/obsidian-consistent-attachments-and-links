/**
 * @file
 *
 * Seeds Advanced Rename and Delete Handler into an integration vault, because this plugin declares it as a
 * dependency and loads nothing of its own until it is there.
 *
 * Without it every suite would meet this plugin blocked — no commands, no handlers, no settings — and fail on
 * something that has nothing to do with what it tests. So every project that opens a vault seeds it: the plain
 * desktop and Android projects through `scripts/vitest-global-setup.ts`, and the demo-vault project through its
 * own setup.
 *
 * The seeded copy is the RELEASED build, pinned, for the reason `download-released-plugin.ts` gives: it is
 * what a user installs, and a test that follows a moving artifact stops being a statement about anything.
 *
 * Its settings are seeded too, so that it does nothing a suite did not ask for: renames, attachment-folder
 * moves and deletions stay off, which is what the vault looked like to this plugin's suites before the
 * dependency existed.
 */

import type { PopulateFilesParams } from 'obsidian-integration-testing';

import { downloadReleasedPlugin } from './download-released-plugin.ts';

/**
 * The dependency's `manifest.id`, which is also the folder it is seeded into.
 */
export const ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID = 'advanced-rename-and-delete-handler';

/**
 * The release seeded.
 */
export const ADVANCED_RENAME_AND_DELETE_HANDLER_VERSION = '1.3.0';

const ADVANCED_RENAME_AND_DELETE_HANDLER_REPO = 'mnaoumov/obsidian-advanced-rename-and-delete-handler';

// Every vault the harness opens keeps its configuration in the default folder.
const VAULT_CONFIG_FOLDER = '.obsidian';

const SEEDED_SETTINGS = {
  shouldHandleDeletions: false,
  shouldHandleRenames: false,
  shouldRenameAttachmentFiles: false,
  shouldRenameAttachmentFolder: false
};

/**
 * Builds the files that install the dependency into a vault, with its settings.
 *
 * @returns The populate map.
 */
export async function getAdvancedRenameAndDeleteHandlerPopulate(): Promise<PopulateFilesParams> {
  const files = await downloadReleasedPlugin({
    pluginId: ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID,
    repo: ADVANCED_RENAME_AND_DELETE_HANDLER_REPO,
    version: ADVANCED_RENAME_AND_DELETE_HANDLER_VERSION
  });

  const pluginFolder = `${VAULT_CONFIG_FOLDER}/plugins/${ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID}`;
  return {
    [`${pluginFolder}/data.json`]: JSON.stringify(SEEDED_SETTINGS),
    [`${pluginFolder}/main.js`]: files.mainJs,
    [`${pluginFolder}/manifest.json`]: files.manifestJson
  };
}
