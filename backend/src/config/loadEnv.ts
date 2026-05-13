import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const stripWrappingQuotes = (value: string) => {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
};

const applyEnvFile = (
  filePath: string,
  initialEnvKeys: Set<string>,
  allowOverride = false,
) => {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    if (!allowOverride && process.env[key] !== undefined) {
      continue;
    }

    if (allowOverride && initialEnvKeys.has(key)) {
      continue;
    }

    process.env[key] = stripWrappingQuotes(rawValue);
  }
};

export const loadBackendEnv = () => {
  const backendRoot = fileURLToPath(new URL("../..", import.meta.url));
  const initialEnvKeys = new Set(Object.keys(process.env));

  applyEnvFile(resolve(backendRoot, ".env"), initialEnvKeys);
  applyEnvFile(resolve(backendRoot, ".env.local"), initialEnvKeys, true);
};
