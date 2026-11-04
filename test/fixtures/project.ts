import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export async function createFakeProject(contentByPath: Record<string, string>): Promise<string> {
  const projectDirectory = await realpath(await mkdtemp(path.join(tmpdir(), "opencode-lsp-project-")));

  for (const [relativePath, content] of Object.entries(contentByPath)) {
    const file = path.join(projectDirectory, relativePath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }

  return projectDirectory;
}
