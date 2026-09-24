import type { PopulateFilesParams } from 'obsidian-integration-testing';

import { join } from 'node:path';
import process from 'node:process';
import { CODE_SCRIPT_TOOLKIT_PLUGIN_ID } from 'obsidian-dev-utils/script-utils/demo-vault-buttons';
import { getRootFolder } from 'obsidian-dev-utils/script-utils/root';
import { buildDemoVaultPopulateAsync } from 'obsidian-integration-testing';
import { createSetup } from 'obsidian-integration-testing/vitest-global-setup-plugin';

import {
  ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID,
  getAdvancedRenameAndDeleteHandlerPopulate
} from './helpers/advanced-rename-and-delete-handler-seed.ts';

// CodeScript Toolkit is what turns a ```code-button fence into a button, and its root-relative
// `require('/demoSetup.ts')` into a call. In real use the in-vault `demo-vault-helper` installs it from
// the community registry on first launch — a GUI step, and `.obsidian/plugins/*` is gitignored, so the
// installed copy exists on exactly the one machine that did it and is invisible to a fresh clone, a new
// machine or CI.
const CODE_SCRIPT_TOOLKIT_SETTINGS = {
  invocableScriptsFolder: 'Invocables',
  modulesRoot: '_assets/CodeScriptToolkit',
  shouldHandleProtocolUrls: true,
  startupScriptPath: 'startup.ts'
};

// Advanced Rename and Delete Handler is seeded for the same reason: the vault's own `startup.ts` installs it
// from the community registry, which is a network step too, and this plugin loads nothing until it is there.
// Seeded, the startup script finds it installed and enabled and leaves it alone.
//
// The ASYNC builder, not the synchronous `buildDemoVaultPopulate`: the sync one requires the injected
// plugin's `main.js` / `manifest.json` to ALREADY be on disk and throws when they are not, so this whole
// project could not run at all in a checkout nobody had opened in a real Obsidian. The async sibling
// downloads the missing plugin's published release assets from the repository that Obsidian's own
// community registry names — the headless equivalent of the GUI step above. A warm checkout does no
// network I/O at all: an already-installed plugin is skipped.
async function populate(): Promise<PopulateFilesParams> {
  return {
    ...await buildDemoVaultPopulateAsync({
      demoVaultPath: join(getRootFolder() ?? process.cwd(), 'demo-vault'),
      injectPlugins: [{
        data: CODE_SCRIPT_TOOLKIT_SETTINGS,
        pluginId: CODE_SCRIPT_TOOLKIT_PLUGIN_ID
      }]
    }),
    ...await getAdvancedRenameAndDeleteHandlerPopulate()
  };
}

// Pre-populates the whole `demo-vault/` tree (plus the CodeScript Toolkit binary and its settings)
// before Obsidian opens, so the startup scan indexes every note in one pass. Used by
// `integration-tests:demo-vault`.
const { setup, teardown } = createSetup({
  enableCommunityPlugins: [CODE_SCRIPT_TOOLKIT_PLUGIN_ID, ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID],
  populate
});

export {
  setup,
  teardown
};
