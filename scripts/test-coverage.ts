import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import { testCoverage } from 'obsidian-dev-utils/script-utils/test-runners/vitest';

const FULL_COVERAGE_PERCENT = 100;

await wrapCliTask(() =>
  testCoverage({
    minCoverageInPercents: FULL_COVERAGE_PERCENT,
    projects: ['unit-tests']
  })
);
