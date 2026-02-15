import { DEFAULT_UPSTREAM_TIMEOUT_MS } from "./constants.js";

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function postJsonRpc(url, body, timeoutMs = DEFAULT_UPSTREAM_TIMEOUT_MS) {
  const res = await fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(body),
    },
    timeoutMs
  );
  if (!res.ok) {
    throw new Error(`upstream_error:${res.status}`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("text/event-stream")) {
    const text = await res.text();
    const dataLines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    if (!dataLines.length) {
      throw new Error("upstream_error:empty_sse");
    }
    return JSON.parse(dataLines[dataLines.length - 1]);
  }
  return res.json();
}

export async function notifyJsonRpc(url, body, timeoutMs = DEFAULT_UPSTREAM_TIMEOUT_MS) {
  try {
    await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(body),
      },
      timeoutMs
    );
  } catch {
    // Ignore notify failures.
  }
}
