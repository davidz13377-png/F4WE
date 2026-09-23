import Constants from "expo-constants";
import { fetch } from "expo/fetch";

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || "http://localhost:4000") as string;
let authToken: string | null = null;
export const setApiToken = (token: string | null) => { authToken = token; };

async function readResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const details: string[] = [];
    const labels: Record<string, string> = {
      title: "Song title",
      artist: "Artist",
      artworkUrl: "Artwork URL",
      file: "File"
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

function isFormDataBody(body: RequestInit["body"]): body is FormData {
  if (!body || typeof body !== "object") return false;
  // React Native/Expo can expose FormData from a different JS realm, where
  // `instanceof FormData` is false even though the value is valid FormData.
  return typeof (body as FormData).append === "function"
    && (Object.prototype.toString.call(body) === "[object FormData]"
      || (body as { constructor?: { name?: string } }).constructor?.name === "FormData"
      || Array.isArray((body as { _parts?: unknown })._parts));
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isForm = isFormDataBody(options.body);
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...(!isForm ? { "Content-Type": "application/json" } : {}), ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}), ...options.headers }
  });
  return readResponse<T>(response);
}

export async function uploadForm<T>(path: string, body: FormData) {
  // Do not pass multipart uploads through the generic JSON request path.
  // Expo fetch must generate the boundary and Content-Type itself.
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
    body
  });
  return readResponse<T>(response);
}

export const currentToken = () => authToken;
