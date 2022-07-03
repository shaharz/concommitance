import * as vscode from "vscode";
import { ExecException, execFile } from "child_process";

const MAX_HITS = 10;

export function gitLogToCommitGroups(stdout: string) {
  // TODO: parse as TSV?
  return stdout.split(/^[\da-f]{7}.*$/gm).map((commitLines) =>
    commitLines
      .split("\n")
      // filter out commit line & empty lines
      .filter((s) => s.length > 0)
      .map((fileLine) => {
        // TODO: try correlating by # lines added/deleted
        const filename = fileLine.split("\t").pop();
        if (!filename) {
          throw Error("invalid line");
        }

        return filename;
      })
  );
}

export function topConCommittedFiles(
  commitGroups: string[][],
  curFile: string,
  maxHits = MAX_HITS
) {
  const hitsPerFile = new Map<string, number>();

  for (const files of commitGroups) {
    if (files.includes(curFile)) {
      for (const file of files) {
        hitsPerFile.set(file, 1 + (hitsPerFile.get(file) ?? 0));
      }
    }
  }

  const sortedMatches = Array.from(hitsPerFile.entries()).sort(
    ([, hitsA], [, hitsB]) => hitsB - hitsA
  );

  // Remove the top match (the current file) and limit number of hits
  return sortedMatches.slice(1, maxHits + 1).map(([file]) => file);
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("concommitance.goToFile", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(
        editor.document.uri
      );
      if (!workspaceFolder) {
        return;
      }

      execFile(
        "git",
        // TODO: stream & lazily parse, improving results gradually?
        ["log", "--numstat", "--oneline", "--max-count=100"],
        { cwd: workspaceFolder.uri.fsPath },
        async (error: ExecException | null, stdout, stderr) => {
          if (error !== null) {
            console.error(error);
            vscode.window.showErrorMessage(
              `Failed to run git log, check console ¯\_(ツ)_/¯`
            );
            return;
          }

          // TODO: cache this (as long as HEAD hasn't changed)
          const commitGroups = gitLogToCommitGroups(stdout);
          const curFile = vscode.workspace.asRelativePath(
            editor.document.fileName
          );

          const conCommittedFiles = topConCommittedFiles(commitGroups, curFile);

          const result = await vscode.window.showQuickPick(conCommittedFiles);
          if (result) {
            await vscode.window.showTextDocument(
              vscode.Uri.joinPath(workspaceFolder.uri, result),
              { preview: true }
            );
          }
        }
      );
    })
  );

  // TODO: explorer tree view of files and their related groups

  console.debug("activated");
}

export function deactivate() {}
