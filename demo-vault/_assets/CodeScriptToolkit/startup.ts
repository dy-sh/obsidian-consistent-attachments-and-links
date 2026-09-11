// Per-vault startup script, run by the universal Demo Vault Helper plugin (via CodeScript
// Toolkit's require) once CodeScript Toolkit is installed and enabled. This is where each
// plugin's demo vault does its own startup setup. Here it installs the one plugin Consistent
// Attachments and Links cannot run without, then opens the landing note.

import type { App } from 'obsidian';

import {
  enableCommunityPlugin,
  installCommunityPlugin
} from 'obsidian-dev-utils/obsidian/community-plugins';

const START_NOTE_PATH = '00 Start.md';

// Consistent Attachments and Links declares it as a dependency and loads nothing until it is there.
const DEPENDENCY_PLUGIN_ID = 'advanced-rename-and-delete-handler';

// Run by CodeScript Toolkit on load (its `startupScriptPath` setting, which the Demo Vault Helper
// points here). CST calls the exported `invoke` — a top-level script with no `invoke` export throws
// `this.startupScript.invoke is not a function`.
export async function invoke(app: App): Promise<void> {
  // Both calls are no-ops when the plugin is already installed and enabled, so reopening the vault
  // changes nothing. Installing it changes nothing in the vault either: its defaults do nothing until
  // you turn renames or deletions on in its settings.
  await installCommunityPlugin({ app, pluginId: DEPENDENCY_PLUGIN_ID });
  await enableCommunityPlugin({ app, pluginId: DEPENDENCY_PLUGIN_ID });

  const startNote = app.vault.getFileByPath(START_NOTE_PATH);
  if (startNote) {
    await app.workspace.getLeaf(false).openFile(startNote);
  }
}
