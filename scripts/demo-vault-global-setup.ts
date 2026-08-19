import type { PopulateFilesParams } from 'obsidian-integration-testing';

import { join } from 'node:path';
import process from 'node:process';
import { CODE_SCRIPT_TOOLKIT_PLUGIN_ID } from 'obsidian-dev-utils/script-utils/demo-vault-buttons';
import { getRootFolder } from 'obsidian-dev-utils/script-utils/root';
import { buildDemoVaultPopulate } from 'obsidian-integration-testing';
import { createSetup } from 'obsidian-integration-testing/vitest-global-setup-plugin';

// CodeScript Toolkit is what turns a ```code-button fence into a button, and its root-relative
// `require('/demoSetup.ts')` into a call. In real use the in-vault `demo-vault-helper` installs it from
// The community registry on first launch — a NETWORK step. Seeding the copy it already installed into
// The in-repo demo vault keeps this run hermetic and independent of that bootstrap.
const CODE_SCRIPT_TOOLKIT_SETTINGS = {
  invocableScriptsFolder: 'Invocables',
  modulesRoot: '_assets/CodeScriptToolkit',
  shouldHandleProtocolUrls: true,
  startupScriptPath: 'startup.ts'
};

function populate(): PopulateFilesParams {
  return buildDemoVaultPopulate({
    demoVaultPath: join(getRootFolder() ?? process.cwd(), 'demo-vault'),
    injectPlugins: [{
      data: CODE_SCRIPT_TOOLKIT_SETTINGS,
      pluginId: CODE_SCRIPT_TOOLKIT_PLUGIN_ID
    }]
  });
}

// Pre-populates the whole `demo-vault/` tree (plus the CodeScript Toolkit binary and its settings)
// Before Obsidian opens, so the startup scan indexes every note in one pass. Used by
// `integration-tests:demo-vault`.
const { setup, teardown } = createSetup({
  enableCommunityPlugins: [CODE_SCRIPT_TOOLKIT_PLUGIN_ID],
  populate
});

export {
  setup,
  teardown
};
