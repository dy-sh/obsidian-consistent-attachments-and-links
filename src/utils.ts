import {
  App,
  TFile,
  type CachedMetadata
} from "obsidian";

export class Utils {
  public static async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  public static normalizePathForFile(path: string): string {
    path = path.replace(/\\/gi, "/"); //replace \ to /
    path = path.replace(/%20/gi, " "); //replace %20 to space
    return path;
  }

  public static normalizePathForLink(path: string): string {
    path = path.replace(/\\/gi, "/"); //replace \ to /
    path = path.replace(/ /gi, "%20"); //replace space to %20
    return path;
  }

  public static normalizeLinkSection(section: string): string {
    section = decodeURI(section);
    return section;
  }

  public static async getCacheSafe(app: App, fileOrPath: TFile | string): Promise<CachedMetadata> {
    const file = Utils.getFileOrNull(app, fileOrPath);
    if (!file) {
      return {};
    }

    while (true) {
      const cache = app.metadataCache.getFileCache(file);
      if (cache) {
        return cache;
      }

      await Utils.delay(100);
    }
  }

  public static getFileOrNull(app: App, fileOrPath: TFile | string): TFile | null {
    if (fileOrPath instanceof TFile) {
      return fileOrPath;
    }

    const abstractFile = app.vault.getAbstractFileByPath(fileOrPath);
    if (!abstractFile) {
      return null;
    }

    if (!(abstractFile instanceof TFile)) {
      throw `${fileOrPath} is not a file`;
    }

    return abstractFile;
  }
}
