/**
 * Auth helpers — token and user state management.
 */

export interface UserData {
  id: number;
  email: string;
  full_name: string;
  university: string;
  department: string;
  program: string | null;
  subscription_tier: string;
  tokens_used_today: number;
  tokens_used_month: number;
  role: string;
  avatar_color: string;
  created_at: string | null;
  last_login: string | null;
}

const TOKEN_KEY = "ikopilot_token";
const USER_KEY = "ikopilot_user";

export function saveAuth(token: string, user: UserData): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser(): UserData | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function clearAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isAuthenticated(): boolean {
  return !!getStoredToken();
}

export function isAdmin(): boolean {
  const user = getStoredUser();
  return user?.role === "admin";
}
