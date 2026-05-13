import type { AuthenticatedUser } from "../types";

interface BackendErrorPayload {
  error?: {
    message?: string;
  };
}

const createBackendUnreachableMessage = () =>
  "Could not reach the backend API. Make sure the backend is running and /api requests are proxied correctly.";

const normalizeBaseUrl = (baseUrl?: string) =>
  (baseUrl ?? "/api").replace(/\/+$/, "");

export class BackendAuthServiceError extends Error {}

export class BackendAuthService {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        headers: {
          "Content-Type": "application/json",
          ...(init?.headers ?? {}),
        },
        credentials: "include",
        ...init,
      });
    } catch (error) {
      if (error instanceof TypeError) {
        throw new BackendAuthServiceError(createBackendUnreachableMessage());
      }

      throw error;
    }

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as BackendErrorPayload;
      throw new BackendAuthServiceError(
        payload.error?.message ?? `Auth request failed with status ${response.status}.`,
      );
    }

    return (await response.json()) as T;
  }

  async getCurrentUser() {
    const payload = await this.request<{ user: AuthenticatedUser | null }>(
      "/auth/me",
      {
        method: "GET",
      },
    );

    return payload.user;
  }

  async register(input: {
    email: string;
    password: string;
    displayName?: string;
  }) {
    const payload = await this.request<{ user: AuthenticatedUser }>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );

    return payload.user;
  }

  async login(input: { email: string; password: string }) {
    const payload = await this.request<{ user: AuthenticatedUser }>(
      "/auth/login",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    );

    return payload.user;
  }

  async logout() {
    await this.request<{ ok: true }>("/auth/logout", {
      method: "POST",
    });
  }
}

export const backendAuthService = new BackendAuthService();
