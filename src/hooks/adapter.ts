import path from "node:path";

function getToolField(toolData: unknown, key: string): unknown {
  return typeof toolData === "object" && toolData !== null ? (toolData as Record<string, unknown>)[key] : undefined;
}

function getFilesEditedByPatch(patchOutput: unknown): string[] {
  const appliedChanges = getToolField(patchOutput, "applied");
  if (!Array.isArray(appliedChanges)) {
    return [];
  }

  return appliedChanges.flatMap((appliedChange) => {
    const editedFile = getToolField(appliedChange, "target");
    const isDeleted = getToolField(appliedChange, "type") === "delete";
    return !isDeleted && typeof editedFile === "string" ? [editedFile] : [];
  });
}

export function getFilesEditedByToolCall(
  toolName: string,
  input: unknown,
  output: unknown,
  projectDirectory: string,
): string[] {
  const editedFiles = (() => {
    if (toolName === "edit") {
      return [getToolField(input, "path")];
    }
    if (toolName === "write") {
      return [getToolField(output, "target") ?? getToolField(input, "path")];
    }
    if (toolName === "patch") {
      return getFilesEditedByPatch(output);
    }
    return [];
  })();

  return editedFiles.flatMap((file) => (typeof file === "string" ? [path.resolve(projectDirectory, file)] : []));
}

export function buildToolResultContent<C>(
  content: string | readonly C[] | undefined,
  text: string,
): string | readonly (C | { type: "text"; text: string })[] | undefined {
  if (!text || content === undefined) {
    return content;
  }

  return typeof content === "string" ? content + text : [...content, { type: "text", text }];
}
