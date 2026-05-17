import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import { test } from 'obsidian-dev-utils/script-utils/test-runners/vitest';

await wrapCliTask(async () => {
  await test({
    projects: ['integration-tests:no-app']
  });
  await test({
    projects: ['integration-tests:android']
  });
  await test({
    projects: ['integration-tests:desktop']
  });
});
