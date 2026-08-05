import process from 'node:process';
import { parseArgs } from 'node:util';
import {
  CliTaskResult,
  wrapCliTask
} from 'obsidian-dev-utils/script-utils/cli-utils';
import {
  findOverExposure,
  formatOverExposureFindings
} from 'obsidian-dev-utils/script-utils/linters/over-exposure';

const [, , ...$arguments] = process.argv;

const { values } = parseArgs({
  // eslint-disable-next-line unicorn/name-replacements -- `args` is a `node:util` `parseArgs` option name.
  args: $arguments,
  options: {
    force: { type: 'boolean' }
  }
});

await wrapCliTask(() => {
  const findings = findOverExposure({ projectFolder: process.cwd(), shouldFix: true, shouldForce: values.force ?? false });
  process.stdout.write(formatOverExposureFindings(findings, { baseFolder: process.cwd() }));
  return CliTaskResult.Success(findings.every((finding) => finding.wasFixed));
});
