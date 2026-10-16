import { lint } from '@mnaoumov/obsidian-dev-toolkit/linters/eslint';
import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import process from 'node:process';

const [, , ...paths] = process.argv;

await wrapCliTask(() => lint({ paths, shouldFix: true }));
