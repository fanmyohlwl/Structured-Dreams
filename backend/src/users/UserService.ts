import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  ensureDirectory,
  readDirectorySafe,
  readJsonFile,
  writeJsonFile,
} from "../shared/filesystem.js";
import type { AuthenticatedUser, StoredUserRecord } from "./types.js";

const now = () => new Date().toISOString();

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const deriveDisplayName = (email: string) => {
  const localPart = email.split("@")[0]?.trim() ?? "";
  const normalized = localPart.replace(/[^a-zA-Z0-9]+/g, " ").trim();
  return normalized || "Structured Dreams User";
};

const toAuthenticatedUser = (record: StoredUserRecord): AuthenticatedUser => ({
  id: record.id,
  email: record.email,
  displayName: record.displayName,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
});

export class UserService {
  private readonly usersDirectory: string;

  constructor(private readonly dataDirectory: string) {
    this.usersDirectory = join(dataDirectory, "users");
  }

  async ensureReady() {
    await ensureDirectory(this.usersDirectory);
  }

  private getUserPath(userId: string) {
    return join(this.usersDirectory, `${userId}.json`);
  }

  async listUsers(): Promise<StoredUserRecord[]> {
    await this.ensureReady();
    const userFiles = (await readDirectorySafe(this.usersDirectory)).filter(
      (fileName) => fileName.endsWith(".json"),
    );
    const users = await Promise.all(
      userFiles.map(async (fileName) => {
        try {
          return await readJsonFile<StoredUserRecord>(
            join(this.usersDirectory, fileName),
          );
        } catch {
          return null;
        }
      }),
    );

    return users.filter((user): user is StoredUserRecord => user != null);
  }

  async getUserById(userId: string): Promise<StoredUserRecord | null> {
    try {
      return await readJsonFile<StoredUserRecord>(this.getUserPath(userId));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async getUserByEmail(email: string): Promise<StoredUserRecord | null> {
    const normalizedEmail = normalizeEmail(email);
    const users = await this.listUsers();
    return (
      users.find((user) => user.normalizedEmail === normalizedEmail) ?? null
    );
  }

  async createUser(input: {
    email: string;
    displayName?: string;
    passwordHash: string;
    passwordSalt: string;
  }): Promise<StoredUserRecord> {
    const normalizedEmail = normalizeEmail(input.email);
    const existingUser = await this.getUserByEmail(normalizedEmail);

    if (existingUser) {
      throw new Error("An account with this email already exists.");
    }

    const timestamp = now();
    const userRecord: StoredUserRecord = {
      id: randomUUID(),
      email: normalizedEmail,
      normalizedEmail,
      displayName:
        input.displayName?.trim() || deriveDisplayName(normalizedEmail),
      passwordHash: input.passwordHash,
      passwordSalt: input.passwordSalt,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    await writeJsonFile(this.getUserPath(userRecord.id), userRecord);
    return userRecord;
  }

  toAuthenticatedUser(record: StoredUserRecord): AuthenticatedUser {
    return toAuthenticatedUser(record);
  }
}
