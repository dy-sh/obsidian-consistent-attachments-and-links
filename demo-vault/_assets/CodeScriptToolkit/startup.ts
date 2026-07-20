// Per-vault startup script, run by the universal Demo Vault Helper plugin (via CodeScript
// Toolkit's require) once CodeScript Toolkit is installed and enabled. This is where each
// plugin's demo vault does its own startup setup. Here it just opens the landing note.

const START_NOTE_PATH = '00 Start.md';

const startNote = app.vault.getFileByPath(START_NOTE_PATH);
if (startNote) {
  void app.workspace.getLeaf(false).openFile(startNote);
}
