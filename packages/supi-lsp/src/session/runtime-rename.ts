import * as path from "node:path";
import type { CodeRequestControl } from "@mrclrchtr/supi-code-runtime/api";
import type { LspClient } from "../client/client.ts";
import type { SemanticInputDocumentSnapshot } from "../client/client-semantic-input-barrier.ts";
import type { Position, WorkspaceEdit } from "../config/types.ts";
import type { LspManager } from "../manager/manager.ts";
import { discoverSemanticEditFiles } from "../provider/semantic-edit-discovery.ts";
import type {
  RoutedMutationDocumentSnapshot,
  RoutedMutationResponse,
} from "./workspace-lsp-runtime.ts";

/** Route one rename and retain request-scoped evidence for every affected file. */
export async function runRoutedRename(options: {
  readonly manager: LspManager;
  readonly file: string;
  readonly position: Position;
  readonly newName: string;
  readonly control?: CodeRequestControl;
}): Promise<RoutedMutationResponse<WorkspaceEdit | null> | null> {
  const { manager, file, position, newName, control } = options;
  const client = await manager.ensureFileOpen(file, {
    recoverProcessCrash: true,
    control,
  });
  if (!client) return null;
  const authorizedMutationRoots = [client.root];

  if (typeof client.renameDetailedWithSnapshots === "function") {
    return renameWithSnapshots({
      client,
      manager,
      file,
      position,
      newName,
      control,
      authorizedMutationRoots,
    });
  }
  if (typeof client.renameDetailed === "function") {
    const result = await client.renameDetailed(file, position, newName, control);
    return {
      value: result.kind === "completed" ? result.data : null,
      authorizedMutationRoots,
      ...(result.kind === "unavailable"
        ? { reason: result.reason }
        : result.data === null
          ? { reason: "LSP server returned no workspace edit." }
          : {}),
    };
  }
  return {
    value: await client.rename(file, position, newName, control),
    authorizedMutationRoots,
  };
}

async function renameWithSnapshots(options: {
  readonly client: LspClient;
  readonly manager: LspManager;
  readonly file: string;
  readonly position: Position;
  readonly newName: string;
  readonly control?: CodeRequestControl;
  readonly authorizedMutationRoots: readonly string[];
}): Promise<RoutedMutationResponse<WorkspaceEdit | null>> {
  const { client, manager, file, position, newName, control, authorizedMutationRoots } = options;
  const first = await client.renameDetailedWithSnapshots(file, position, newName, {
    control,
    snapshotFiles: [file],
  });
  if (first.result.kind === "unavailable" || first.result.data === null) {
    return {
      value: null,
      authorizedMutationRoots,
      ...(first.result.kind === "unavailable"
        ? { reason: first.result.reason }
        : { reason: "LSP server returned no workspace edit." }),
    };
  }

  const discovery = discoverSemanticEditFiles(first.result.data);
  if (discovery.kind === "unavailable") {
    return { value: null, authorizedMutationRoots, reason: discovery.reason };
  }
  if (hasRenameDocumentSnapshots(discovery.files, first.documentSnapshots)) {
    return {
      value: first.result.data,
      authorizedMutationRoots,
      documentSnapshots: mapRenameDocumentSnapshots(first.documentSnapshots),
    };
  }

  if (first.inputRevision === undefined) {
    return {
      value: null,
      authorizedMutationRoots,
      reason: "Rename has no verified input revision for document enrollment.",
    };
  }
  const enrollment = await manager.enrollRenameDocuments(client, discovery.files, control);
  if (enrollment.kind === "unavailable") {
    return { value: null, authorizedMutationRoots, reason: enrollment.reason };
  }
  const snapshotFiles = [...new Set([file, ...discovery.files])].sort((left, right) =>
    left.localeCompare(right),
  );
  const followup = await client.renameDetailedWithSnapshots(file, position, newName, {
    control,
    snapshotFiles,
    inputRevision: first.inputRevision,
  });
  if (followup.result.kind === "unavailable" || followup.result.data === null) {
    return {
      value: null,
      authorizedMutationRoots,
      ...(followup.result.kind === "unavailable"
        ? { reason: followup.result.reason }
        : { reason: "LSP server returned no workspace edit after document enrollment." }),
    };
  }

  const verified = discoverSemanticEditFiles(followup.result.data);
  if (
    verified.kind === "unavailable" ||
    !isSubset(verified.files, discovery.files) ||
    !hasRenameDocumentSnapshots(snapshotFiles, followup.documentSnapshots)
  ) {
    return {
      value: null,
      authorizedMutationRoots,
      reason: "Rename response changed its edit targets after synchronized enrollment.",
    };
  }
  return {
    value: followup.result.data,
    authorizedMutationRoots,
    documentSnapshots: mapRenameDocumentSnapshots(followup.documentSnapshots),
  };
}

function hasRenameDocumentSnapshots(
  files: readonly string[],
  snapshots: readonly SemanticInputDocumentSnapshot[],
): boolean {
  const byFile = new Map(snapshots.map((snapshot) => [path.resolve(snapshot.filePath), snapshot]));
  return files.every((file) => {
    const snapshot = byFile.get(path.resolve(file));
    return Boolean(
      snapshot &&
        snapshot.version >= 0 &&
        snapshot.contentFingerprint.length > 0 &&
        snapshot.contentFingerprint === snapshot.diskContentFingerprint,
    );
  });
}

function mapRenameDocumentSnapshots(
  snapshots: readonly SemanticInputDocumentSnapshot[],
): RoutedMutationDocumentSnapshot[] {
  return snapshots.map((snapshot) => ({
    file: snapshot.filePath,
    version: snapshot.version,
    contentFingerprint: snapshot.contentFingerprint,
    diskContentFingerprint: snapshot.diskContentFingerprint,
  }));
}

function isSubset(values: readonly string[], allowed: readonly string[]): boolean {
  const accepted = new Set(allowed.map((file) => path.resolve(file)));
  return values.every((file) => accepted.has(path.resolve(file)));
}
