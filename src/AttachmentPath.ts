import type {
  App,
  TFolder
} from "obsidian";
import { posix } from "@jinder/path";
const {
  basename,
  dirname,
  extname
} = posix;
import { createTFileInstance } from "obsidian-typings/implementations";

export async function getAttachmentFolderPath(app: App, notePath: string): Promise<string> {
  return dirname(await getAttachmentFilePath(app, "DUMMY_FILE.pdf", notePath));
}

export async function getAttachmentFilePath(app: App, attachmentPath: string, notePath: string): Promise<string> {
  const note = createTFileInstance(app.vault, notePath);
  const ext = extname(attachmentPath);
  const fileName = basename(attachmentPath, ext);

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalCreateFolder = app.vault.createFolder;
  app.vault.createFolder = async (path: string): Promise<TFolder> => {
    if (new Error().stack?.includes("getAvailablePathForAttachments")) {
      return note.parent!;
    }
    return originalCreateFolder.call(app.vault, path);
  };

  try {
    const newAttachmentPath = await app.vault.getAvailablePathForAttachments(fileName, ext.slice(1), note);
    return newAttachmentPath;
  } finally {
    app.vault.createFolder = originalCreateFolder;
  }
}
