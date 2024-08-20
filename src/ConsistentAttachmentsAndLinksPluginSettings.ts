export default class ConsistentAttachmentsAndLinksPluginSettings {
  public autoCollectAttachments: boolean = false;
  public changeNoteBacklinksAlt: boolean = false;
  public consistencyReportFile: string = "consistency-report.md";
  public deleteAttachmentsWithNote: boolean = true;
  public deleteEmptyFolders: boolean = true;
  public deleteExistFilesWhenMoveNote: boolean = true;
  public ignoreFiles: string[] = ["consistency\\-report\\.md"];
  public ignoreFolders: string[] = [".git/", ".obsidian/"];
  public moveAttachmentsWithNote: boolean = true;
  public showWarning: boolean = true;
  public updateLinks: boolean = true;

  public getIgnoreFilesRegex(): RegExp[] {
    return this.ignoreFiles.map(file => RegExp(file));
  }
}
