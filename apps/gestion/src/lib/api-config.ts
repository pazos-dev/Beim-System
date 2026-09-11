/**
 * API configuration for direct backend consumption.
 */

const DEFAULT_API_BASE_URL = "http://localhost:4000";

/** Base URL of the backend API (no trailing slash). */
export const API_BASE_URL =
  (typeof process !== "undefined" && process.env?.BEIM_API_BASE_URL) ||
  DEFAULT_API_BASE_URL;

/** API version prefix. */
export const API_PREFIX = "/api/v1";

/** Full base URL for API requests. */
export function apiUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/+$/, "");
  const prefix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${API_PREFIX}${prefix}`;
}

// Re-export cookie helpers for backward compatibility
export { getAuthToken, setAuthToken, clearAuthToken } from "./api/cookies";
