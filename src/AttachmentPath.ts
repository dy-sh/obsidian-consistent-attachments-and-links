import type { App } from "obsidian";
import {
  basename,
  dirname,
  extname
} from "obsidian-dev-utils/Path";
import { createTFileInstance } from "obsidian-typings/implementations";

export async function getAttachmentFolderPath(app: App, notePath: string): Promise<string> {
  return dirname(await getAttachmentFilePath(app, "DUMMY_FILE.pdf", notePath));
}

export async function getAttachmentFilePath(app: App, attachmentPath: string, notePath: string): Promise<string> {
  const note = createTFileInstance(app.vault, notePath);
  const ext = extname(attachmentPath);
  const fileName = basename(attachmentPath, ext);

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalMkdir = app.vault.adapter.mkdir;
  app.vault.adapter.mkdir = async (path: string): Promise<void> => {
    if (new Error().stack?.includes("getAvailablePathForAttachments")) {
      return;
    }
    return originalMkdir.call(app.vault.adapter, path);
  };

  try {
    const newAttachmentPath = await app.vault.getAvailablePathForAttachments(fileName, ext.slice(1), note);
    return newAttachmentPath;
  } finally {
    app.vault.adapter.mkdir = originalMkdir;
  }
}
