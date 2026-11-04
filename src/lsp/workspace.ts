import { access, readdir } from "node:fs/promises";
import path from "node:path";

async function hasMarkerFile(directory: string, marker: string): Promise<boolean> {
  if (!marker.includes("*")) {
    return access(path.join(directory, marker)).then(
      () => true,
      () => false,
    );
  }

  const markerPattern = new Bun.Glob(marker);
  const directoryEntries = await readdir(directory).catch(() => []);

  return directoryEntries.some((entry) => markerPattern.match(entry));
}

export async function findMarkerDirectory(
  startDirectory: string,
  stopDirectory: string,
  markers: readonly string[],
): Promise<string | undefined> {
  let currentDirectory = startDirectory;
  while (true) {
    for (const marker of markers) {
      if (await hasMarkerFile(currentDirectory, marker)) {
        return currentDirectory;
      }
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (currentDirectory === stopDirectory || parentDirectory === currentDirectory) {
      return undefined;
    }
    currentDirectory = parentDirectory;
  }
}

export function findMarkerDirectoryForFile(
  file: string,
  projectDirectory: string,
  markers: readonly string[],
): Promise<string | undefined> {
  return findMarkerDirectory(path.dirname(file), projectDirectory, markers);
}

export async function getMarkerDirectoryForFileOrDefault(
  file: string,
  projectDirectory: string,
  markers: readonly string[],
): Promise<string> {
  return (await findMarkerDirectoryForFile(file, projectDirectory, markers)) ?? projectDirectory;
}
