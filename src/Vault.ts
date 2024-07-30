import {
  App,
  TFile
} from "obsidian";
import {
  deepEqual,
  toJson
} from "./Object.ts";
import {
  retryWithTimeout,
  type MaybePromise
} from "./Async.ts";

type FileChange = {
  startIndex: number;
  endIndex: number;
  oldContent: string;
  newContent: string;
};

export function getMarkdownFilesSorted(app: App): TFile[] {
  return app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
}

export async function processWithRetry(app: App, file: TFile, processFn: (content: string) => MaybePromise<string>): Promise<void> {
  await retryWithTimeout(async () => {
    const oldContent = await app.vault.adapter.read(file.path);
    const newContent = await processFn(oldContent);
    let success = true;
    await app.vault.process(file, (content) => {
      if (content !== oldContent) {
        console.warn(`Content of ${file.path} has changed since it was read. Retrying...`);
        success = false;
        return content;
      }

      return newContent;
    });

    return success;
  });
}

export async function applyFileChanges(app: App, file: TFile, changesFn: () => MaybePromise<FileChange[]>): Promise<void> {
  await retryWithTimeout(async () => {
    let doChangesMatchContent = true;

    await processWithRetry(app, file, async (content) => {
      let changes = await changesFn();

      for (const change of changes) {
        const actualContent = content.slice(change.startIndex, change.endIndex);
        if (actualContent !== change.oldContent) {
          console.warn(`Content mismatch at ${change.startIndex}-${change.endIndex} in ${file.path}:\nExpected: ${change.oldContent}\nActual: ${actualContent}`);
          doChangesMatchContent = false;
          return content;
        }
      }

      changes.sort((a, b) => a.startIndex - b.startIndex);

      // BUG: https://forum.obsidian.md/t/bug-duplicated-links-in-metadatacache-inside-footnotes/85551
      changes = changes.filter((change, index) => {
        if (index === 0) {
          return true;
        }
        return !deepEqual(change, changes[index - 1]);
      });

      for (let i = 1; i < changes.length; i++) {
        const change = changes[i]!;
        const previousChange = changes[i - 1]!;
        if (previousChange.endIndex >= change.startIndex) {
          throw new Error(`Overlapping changes:\n${toJson(previousChange)}\n${toJson(change)}`);
        }
      }

      let newContent = "";
      let lastIndex = 0;

      for (const change of changes) {
        newContent += content.slice(lastIndex, change.startIndex);
        newContent += change.newContent;
        lastIndex = change.endIndex;
      }

      newContent += content.slice(lastIndex);
      return newContent;
    });

    return doChangesMatchContent;
  });
}
