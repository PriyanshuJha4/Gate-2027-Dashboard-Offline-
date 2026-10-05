/**
 * Small fetch helpers used by every screen that reads or writes study data.
 *
 * Why this file exists: before, many screens did `await fetch(...)` and ignored the answer.
 * A server error (HTTP 500) then looked exactly like success, and a failed load looked like "no data".
 * Now both helpers THROW when the network is down OR the server answers with an error status,
 * so the caller's catch block can show a real message and undo the change on screen.
 */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const OFFLINE_MSG = "Could not reach the app server. Is the dashboard window (start-gate) still open?";

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === "string" && body.error) return body.error;
  } catch {
    /* body was not JSON */
  }
  return `Server error ${res.status}`;
}

/** GET + parse JSON. Throws ApiError on network failure, non-2xx status or unreadable JSON. */
export async function apiGet<T = any>(url: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new ApiError(OFFLINE_MSG, 0);
  }
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError("The server sent an unreadable answer.", res.status);
  }
}

/** POST / PUT / PATCH / DELETE. Throws ApiError unless the server confirms with a 2xx status. */
export async function apiSend(
  url: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(OFFLINE_MSG, 0);
  }
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  return res.json().catch(() => ({}));
}

/** Text for an error caught in a screen. */
export function errText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
