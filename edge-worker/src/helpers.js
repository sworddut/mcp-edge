export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function asJsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

export function asJsonRpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return { jsonrpc: "2.0", id, error };
}

export function parseNodeUrls(env) {
  const raw = env.MCP_NODES || "[]";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => (typeof entry === "string" ? { url: entry } : entry));
    }
    return [];
  } catch {
    return raw
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((url) => ({ url }));
  }
}

export function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function deriveNodeId(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    return slugify(`${parsed.host}${path}`);
  } catch {
    return slugify(url);
  }
}

export function textContent(payload) {
  return [{ type: "text", text: JSON.stringify(payload) }];
}

export function parsePositiveInt(value, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function nowMs() {
  return Date.now();
}
