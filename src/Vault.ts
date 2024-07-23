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

export function getMarkdownFilesSorted(app: App): TFile[] {
  return app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
}

type FileChange = {
  startIndex: number;
  endIndex: number;
  newContent: string;
};

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
  await processWithRetry(app, file, async (content) => {
    let changes = await changesFn();
    changes.sort((a, b) => a.startIndex - b.startIndex);

    // BUG: https://forum.obsidian.md/t/bug-duplicated-links-in-metadatacache-inside-footnotes/85551
    changes = changes.filter((change, index) => {
      if (index === 0) {
        return true;
      }
      return !deepEqual(change, changes[index - 1]);
    });

    for (let i = 1; i < changes.length; i++) {
      if (changes[i - 1]!.endIndex >= changes[i]!.startIndex) {
        throw new Error(`Overlapping changes:\n${toJson(changes[i - 1])}\n${toJson(changes[i])}`);
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
}
