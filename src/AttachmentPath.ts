import type { App } from "obsidian";
import { posix } from "@jinder/path";
const {
  basename,
  dirname,
  extname
} = posix;

export async function getAttachmentFolderPath(app: App, notePath: string): Promise<string> {
  return dirname(await getAttachmentFilePath(app, "DUMMY_FILE.pdf", notePath));
}

export async function getAttachmentFilePath(app: App, attachmentPath: string, notePath: string): Promise<string> {
  let note = app.vault.getFileByPath(notePath);
  let fakeNoteCreated = false;
  if (!note) {
    note = await app.vault.create(notePath, "");
    fakeNoteCreated = true;
  }
  const ext = extname(attachmentPath);
  const fileName = basename(attachmentPath, ext);
  const newAttachmentPath = await app.vault.getAvailablePathForAttachments(fileName, ext.slice(1), note);
  if (fakeNoteCreated) {
    await app.vault.delete(note);
  }

  return newAttachmentPath;
}
