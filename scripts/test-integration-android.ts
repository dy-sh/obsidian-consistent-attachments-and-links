import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import { test } from 'obsidian-dev-utils/script-utils/test-runners/vitest';

await wrapCliTask(() =>
  test({
    projects: ['integration-tests:android']
  })
);
