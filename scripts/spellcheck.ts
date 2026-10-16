import { wrapCliTask } from '@mnaoumov/typescript-dev-toolkit/cli-utils';
import { spellcheck } from '@mnaoumov/typescript-dev-toolkit/linters/cspell';
import process from 'node:process';

const [, , ...paths] = process.argv;

await wrapCliTask(() => spellcheck({ paths }));
