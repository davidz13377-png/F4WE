import Constants from "expo-constants";
import { fetch } from "expo/fetch";

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || "http://localhost:4000") as string;
let authToken: string | null = null;
export const setApiToken = (token: string | null) => { authToken = token; };

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...(!isForm ? { "Content-Type": "application/json" } : {}), ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}), ...options.headers }
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details: string[] = [];
    const labels: Record<string, string> = {
      title: "Song title",
      artist: "Artist",
      artworkUrl: "Artwork URL",
      file: "MP3 file"
    };
    const fieldErrors = body?.fields?.fieldErrors;
    if (fieldErrors && typeof fieldErrors === "object") {
      for (const [field, errors] of Object.entries(fieldErrors)) {
        if (Array.isArray(errors)) {
          for (const message of errors) {
            if (typeof message === "string") details.push(`${labels[field] || field}: ${message}`);
          }
        }
      }
    }
    const formErrors = body?.fields?.formErrors;
    if (Array.isArray(formErrors)) {
      for (const message of formErrors) {
        if (typeof message === "string") details.push(message);
      }
    }
    const summary = typeof body?.error === "string" ? body.error : "Request failed";
    throw new Error([`${summary} (HTTP ${response.status})`, ...details].join("\n"));
  }
  return body as T;
}

export function uploadForm<T>(path: string, body: FormData) {
  return api<T>(path, { method: "POST", body });
}

export const currentToken = () => authToken;
