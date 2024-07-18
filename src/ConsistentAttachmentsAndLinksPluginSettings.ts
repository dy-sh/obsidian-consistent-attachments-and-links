export default class ConsistentAttachmentsAndLinksPluginSettings {
  public moveAttachmentsWithNote: boolean = true;
  public deleteAttachmentsWithNote: boolean = true;
  public updateLinks: boolean = true;
  public deleteEmptyFolders: boolean = true;
  public deleteExistFilesWhenMoveNote: boolean = true;
  public changeNoteBacklinksAlt: boolean = false;
  public ignoreFolders: string[] = [".git/", ".obsidian/"];
  public ignoreFiles: string[] = ["consistency\\-report\\.md"];
  public attachmentsSubfolder: string = "";
  public consistencyReportFile: string = "consistency-report.md";
  public useBuiltInObsidianLinkCaching: boolean = false;

  public getIgnoreFilesRegex(): RegExp[] {
    return this.ignoreFiles.map(file => RegExp(file));
  }

  public static load(data: unknown): ConsistentAttachmentsAndLinksPluginSettings {
    return ConsistentAttachmentsAndLinksPluginSettings.clone(data as ConsistentAttachmentsAndLinksPluginSettings);
  }

  public static clone(settings?: ConsistentAttachmentsAndLinksPluginSettings): ConsistentAttachmentsAndLinksPluginSettings {
    const target = new ConsistentAttachmentsAndLinksPluginSettings();
    if (settings) {
      for (const key of Object.keys(target) as Array<keyof ConsistentAttachmentsAndLinksPluginSettings>) {
        if (key in settings && typeof settings[key] === typeof target[key]) {
          Object.assign(target, { [key]: settings[key] });
        }
      }
    }
    return target;
  }
}
