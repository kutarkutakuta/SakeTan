import { browserApi } from "@/lib/browser-api";

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
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  const request = browserApi(input, init).then(
    (response) => response ?? fetch(input, init),
  );
  let onAbort: (() => void) | undefined;
  const response = signal
    ? await Promise.race([
        request,
        new Promise<never>((_, reject) => {
          onAbort = () => reject(new DOMException("Aborted", "AbortError"));
          signal.addEventListener("abort", onAbort, { once: true });
        }),
      ]).finally(() => {
        if (onAbort) signal.removeEventListener("abort", onAbort);
      })
    : await request;
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
