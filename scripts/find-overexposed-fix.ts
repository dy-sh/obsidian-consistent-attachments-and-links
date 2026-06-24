import process from 'node:process';
import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import {
  findOverExposure,
  formatOverExposureFindings
} from 'obsidian-dev-utils/script-utils/linters/over-exposure';

await wrapCliTask(() => {
  const findings = findOverExposure({ projectFolder: process.cwd(), shouldFix: true });
  process.stdout.write(formatOverExposureFindings(findings, { baseFolder: process.cwd() }));
});
