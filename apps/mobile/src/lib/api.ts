import Constants from "expo-constants";
import { fetch as expoFetch } from "expo/fetch";
import { File, UploadType } from "expo-file-system";

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || "http://localhost:4000") as string;
let authToken: string | null = null;
export const setApiToken = (token: string | null) => { authToken = token; };

function responseBody<T>(status: number, body: unknown): T {
  if (status === 204) return undefined as T;
  if (status < 200 || status >= 300) {
    const value = body as { error?: unknown; fields?: { fieldErrors?: Record<string, unknown>; formErrors?: unknown } };
    const details: string[] = [];
    const labels: Record<string, string> = {
      title: "Song title",
      artist: "Artist",
      artworkUrl: "Artwork URL",
      file: "File"
    };
    const fieldErrors = value?.fields?.fieldErrors;
    if (fieldErrors && typeof fieldErrors === "object") {
      for (const [field, errors] of Object.entries(fieldErrors)) {
        if (Array.isArray(errors)) {
          for (const message of errors) {
            if (typeof message === "string") details.push(`${labels[field] || field}: ${message}`);
          }
        }
      }
    }
    const formErrors = value?.fields?.formErrors;
    if (Array.isArray(formErrors)) {
      for (const message of formErrors) {
        if (typeof message === "string") details.push(message);
      }
    }
    const summary = typeof value?.error === "string" ? value.error : "Request failed";
    throw new Error([`${summary} (HTTP ${status})`, ...details].join("\n"));
  }
  return body as T;
}

async function readResponse<T>(response: Response): Promise<T> {
  const body = response.status === 204 ? undefined : await response.json().catch(() => ({}));
  return responseBody<T>(response.status, body);
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
  const response = await expoFetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...(!isForm ? { "Content-Type": "application/json" } : {}), ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}), ...options.headers }
  });
  return readResponse<T>(response);
}

export type NativeUploadFile = { uri: string; name: string; type: string; size?: number };

export async function uploadFile<T>(path: string, selected: NativeUploadFile, parameters: Record<string, string> = {}) {
  const setup = await api<{ uploadUrl: string; uploadToken: string; contentType: string; expiresIn: number }>(`${path}/upload-url`, {
    method: "POST",
    body: JSON.stringify({ mimeType: selected.type, ...(selected.size !== undefined ? { size: selected.size } : {}) })
  });
  const file = new File(selected.uri);
  const result = await file.upload(setup.uploadUrl, {
    httpMethod: "PUT",
    uploadType: UploadType.BINARY_CONTENT,
    mimeType: setup.contentType,
    headers: { "Content-Type": setup.contentType }
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Storage upload failed (HTTP ${result.status}). Please try again.`);
  }
  return api<T>(`${path}/complete`, {
    method: "POST",
    body: JSON.stringify({ uploadToken: setup.uploadToken, ...parameters })
  });
}

export const currentToken = () => authToken;
