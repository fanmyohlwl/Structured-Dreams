import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  ensureDirectory,
  readDirectorySafe,
  readJsonFile,
  writeJsonFile,
} from "../shared/filesystem.js";
import { UserService } from "../users/UserService.js";
import type {
  AuthenticatedUser,
  StoredSessionRecord,
  StoredUserRecord,
} from "../users/types.js";

const now = () => new Date().toISOString();
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

const hashPassword = (password: string, salt: string) =>
  scryptSync(password, salt, 64).toString("hex");

const isPasswordValid = (
  password: string,
  expectedHash: string,
  salt: string,
) => {
  const received = Buffer.from(hashPassword(password, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  if (received.byteLength !== expected.byteLength) {
    return false;
  }

  return timingSafeEqual(received, expected);
};

const createPasswordSalt = () => randomBytes(16).toString("hex");
const createSessionId = () => randomBytes(32).toString("hex");

export class AuthService {
  private readonly sessionsDirectory: string;

  constructor(
    private readonly dataDirectory: string,
    private readonly userService: UserService,
  ) {
    this.sessionsDirectory = join(dataDirectory, "sessions");
  }

  async ensureReady() {
    await this.userService.ensureReady();
    await ensureDirectory(this.sessionsDirectory);
  }

  private getSessionPath(sessionId: string) {
    return join(this.sessionsDirectory, `${sessionId}.json`);
  }

  private async writeSession(userId: string) {
    const timestamp = now();
    const sessionRecord: StoredSessionRecord = {
      id: createSessionId(),
      userId,
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    };

    await writeJsonFile(this.getSessionPath(sessionRecord.id), sessionRecord);
    return sessionRecord;
  }

  private async getSessionRecord(
    sessionId: string,
  ): Promise<StoredSessionRecord | null> {
    try {
      const session = await readJsonFile<StoredSessionRecord>(
        this.getSessionPath(sessionId),
      );

      if (new Date(session.expiresAt).getTime() <= Date.now()) {
        await this.deleteSession(session.id);
        return null;
      }

      return session;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }

      throw error;
    }
  }

  async deleteSession(sessionId: string) {
    await rm(this.getSessionPath(sessionId), { force: true });
  }

  async register(input: {
    email: string;
    password: string;
    displayName?: string;
  }): Promise<{ user: AuthenticatedUser; sessionId: string }> {
    await this.ensureReady();
    const email = input.email.trim().toLowerCase();
    const password = input.password.trim();

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error("Please provide a valid email address.");
    }

    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters long.");
    }

    const salt = createPasswordSalt();
    const userRecord = await this.userService.createUser({
      email,
      displayName: input.displayName,
      passwordHash: hashPassword(password, salt),
      passwordSalt: salt,
    });
    const session = await this.writeSession(userRecord.id);

    return {
      user: this.userService.toAuthenticatedUser(userRecord),
      sessionId: session.id,
    };
  }

  async login(input: {
    email: string;
    password: string;
  }): Promise<{ user: AuthenticatedUser; sessionId: string }> {
    await this.ensureReady();
    const userRecord = await this.userService.getUserByEmail(input.email);

    if (!userRecord || !isPasswordValid(input.password, userRecord.passwordHash, userRecord.passwordSalt)) {
      throw new Error("Invalid email or password.");
    }

    const session = await this.writeSession(userRecord.id);

    return {
      user: this.userService.toAuthenticatedUser(userRecord),
      sessionId: session.id,
    };
  }

  async getAuthenticatedUser(
    sessionId: string | null | undefined,
  ): Promise<AuthenticatedUser | null> {
    if (!sessionId) {
      return null;
    }

    const session = await this.getSessionRecord(sessionId);

    if (!session) {
      return null;
    }

    const userRecord = await this.userService.getUserById(session.userId);

    if (!userRecord) {
      await this.deleteSession(session.id);
      return null;
    }

    return this.userService.toAuthenticatedUser(userRecord);
  }

  async listUsers(): Promise<StoredUserRecord[]> {
    return this.userService.listUsers();
  }

  async revokeAllUserSessions(userId: string) {
    await this.ensureReady();
    const sessionFiles = (await readDirectorySafe(this.sessionsDirectory)).filter(
      (fileName) => fileName.endsWith(".json"),
    );

    await Promise.all(
      sessionFiles.map(async (fileName) => {
        try {
          const session = await readJsonFile<StoredSessionRecord>(
            join(this.sessionsDirectory, fileName),
          );

          if (session.userId === userId) {
            await this.deleteSession(session.id);
          }
        } catch {
          return;
        }
      }),
    );
  }
}

export const SESSION_COOKIE_NAME = "promptblocks_session";
export const SESSION_COOKIE_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;
