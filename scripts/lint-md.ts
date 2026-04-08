import process from 'node:process';
import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import { lint } from 'obsidian-dev-utils/script-utils/linters/markdownlint';

const [, , ...paths] = process.argv;

await wrapCliTask(() => lint({ paths }));
