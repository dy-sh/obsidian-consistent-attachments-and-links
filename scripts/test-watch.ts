import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import { testWatch } from 'obsidian-dev-utils/script-utils/test-runners/vitest';

await wrapCliTask(() =>
  testWatch({
    projects: ['unit-tests']
  })
);
