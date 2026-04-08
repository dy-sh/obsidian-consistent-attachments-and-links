import process from 'node:process';
import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import { format } from 'obsidian-dev-utils/script-utils/formatters/dprint';

const [, , ...paths] = process.argv;

await wrapCliTask(() => format({ paths, rewrite: false }));
