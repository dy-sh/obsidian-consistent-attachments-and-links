import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { test } from '@mnaoumov/typescript-dev-toolkit/test-runners/vitest';

await wrapCliTask(async () => {
  await test({
    projects: ['integration-tests:no-app']
  });
  await test({
    projects: ['integration-tests:demo-vault']
  });
  await test({
    projects: ['integration-tests:android']
  });
  await test({
    projects: ['integration-tests:desktop']
  });
});
