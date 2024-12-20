import { PluginSettingsBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsBase';

export class ConsistentAttachmentsAndLinksPluginSettings extends PluginSettingsBase {
  public autoCollectAttachments = false;

  public changeNoteBacklinksAlt = true;
  public consistencyReportFile = 'consistency-report.md';
  public deleteAttachmentsWithNote = true;
  public deleteEmptyFolders = true;
  public deleteExistFilesWhenMoveNote = true;
  public ignoreFiles: string[] = ['consistency\\-report\\.md'];
  public ignoreFolders: string[] = ['.git/', '.obsidian/'];
  public moveAttachmentsWithNote = true;
  public showWarning = true;
  public updateLinks = true;
  public constructor(data: unknown) {
    super();
    this.init(data);
  }

  public getIgnoreFilesRegex(): RegExp[] {
    return this.ignoreFiles.map((file) => RegExp(file));
  }
}
