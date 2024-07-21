import {
  App,
  TFile
} from "obsidian";

export function getMarkdownFilesSorted(app: App): TFile[] {
  return app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
}
