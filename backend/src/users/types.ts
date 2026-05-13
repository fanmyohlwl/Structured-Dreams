export interface StoredUserRecord {
  id: string;
  email: string;
  normalizedEmail: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredSessionRecord {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}
