import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const ensureDirectory = async (directoryPath: string) => {
  await mkdir(directoryPath, { recursive: true });
};

export const ensureParentDirectory = async (filePath: string) => {
  await ensureDirectory(dirname(filePath));
};

export const writeJsonFile = async (filePath: string, value: unknown) => {
  await ensureParentDirectory(filePath);
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
};

export const readJsonFile = async <T>(filePath: string): Promise<T> => {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
};

export const readDirectorySafe = async (directoryPath: string) => {
  try {
    return await readdir(directoryPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }
};
