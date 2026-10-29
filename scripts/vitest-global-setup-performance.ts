/**
 * @file
 *
 * The global setup of the `integration-tests:desktop-performance` project: the shared one's plugins — `Advanced
 * Rename and Delete Handler`, without which this plugin loads nothing, and the integration-test harness plugin,
 * which gives a closure `lib.publishPluginApi` — over the performance corpus instead of an empty vault.
 */

import {
  getIntegrationTestPluginPopulate,
  OBSIDIAN_DEV_TOOLKIT_INTEGRATION_TEST_PLUGIN_ID
} from '@mnaoumov/obsidian-dev-toolkit/test-runners/integration-test-plugin';
import { createSetup } from 'obsidian-integration-testing/vitest-global-setup-plugin';

import {
  ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID,
  getAdvancedRenameAndDeleteHandlerPopulate
} from './helpers/advanced-rename-and-delete-handler-seed.ts';
import { generateConsistencyPerformanceVault } from './helpers/performance-vault.ts';

export const { setup, teardown } = createSetup({
  enableCommunityPlugins: [ADVANCED_RENAME_AND_DELETE_HANDLER_PLUGIN_ID, OBSIDIAN_DEV_TOOLKIT_INTEGRATION_TEST_PLUGIN_ID],
  populate: async () => ({
    ...generateConsistencyPerformanceVault(),
    ...await getAdvancedRenameAndDeleteHandlerPopulate(),
    ...getIntegrationTestPluginPopulate()
  })
});
