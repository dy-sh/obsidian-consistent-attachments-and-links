import { format } from '@mnaoumov/obsidian-dev-toolkit/formatters/dprint';
import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import process from 'node:process';

const [, , ...paths] = process.argv;

await wrapCliTask(() => format({ paths }));
