type ApiError = { error?: unknown };

function apiErrorMessage(data: unknown, fallback: string) {
  const error =
    data && typeof data === "object" && "error" in data
      ? (data as ApiError).error
      : undefined;
  if (typeof error === "string") return error;
  return fallback;
}

export async function fetchJson<T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  fallback: string,
) {
  const response = await fetch(input, init);
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(apiErrorMessage(data, fallback));
  if (data === null) throw new Error(fallback);
  return data as T;
}

export function errorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error ? reason.message : fallback;
}

export function isAbortError(reason: unknown) {
  return reason instanceof DOMException && reason.name === "AbortError";
}

export async function mutate<T = string>(body: unknown) {
  return fetchJson<{ id: T }>(
    "/api/action",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    "保存できませんでした",
  );
}
