import process from 'node:process';
import { wrapCliTask } from 'obsidian-dev-utils/script-utils/cli-utils';
import { spellcheck } from 'obsidian-dev-utils/script-utils/linters/cspell';

const [, , ...paths] = process.argv;

await wrapCliTask(() => spellcheck({ paths }));
