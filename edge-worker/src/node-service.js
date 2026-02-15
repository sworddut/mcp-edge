import {
  DEFAULT_NODE_DISCOVERY_CACHE_TTL,
  DEFAULT_NODE_TOOLS_CACHE_TTL,
  DEFAULT_UPSTREAM_TIMEOUT_MS,
  GATEWAY_NAME,
  GATEWAY_VERSION,
  MCP_VERSION,
} from "./constants.js";
import {
  deriveNodeId,
  hashString,
  nowMs,
  parseNodeUrls,
  parsePositiveInt,
  slugify,
} from "./helpers.js";
import { postJsonRpc, notifyJsonRpc } from "./mcp-client.js";
import { redisGetJson, redisSetJson } from "./redis.js";

function nodesCacheKey(env) {
  const raw = String(env.MCP_NODES || "[]");
  return `mcp:nodes:${hashString(raw)}`;
}

function nodeToolsCacheKey(node) {
  return `mcp:node_tools:${node.id}:${hashString(node.url)}`;
}

function findNode(nodes, nodeId) {
  const normalized = String(nodeId).toLowerCase();
  return nodes.find((n) => {
    if (n.id === nodeId || n.url === nodeId || n.name === nodeId) {
      return true;
    }
    if (n.name && n.name.toLowerCase() === normalized) {
      return true;
    }
    return slugify(n.name || "") === normalized;
  });
}

async function discoverNodes(env) {
  const upstreamTimeoutMs = parsePositiveInt(env.UPSTREAM_TIMEOUT_MS, DEFAULT_UPSTREAM_TIMEOUT_MS);
  const entries = parseNodeUrls(env);
  const nodes = [];
  for (const entry of entries) {
    const url = entry.url;
    let name = entry.name || "";
    let description = entry.description || "";
    try {
      const init = await postJsonRpc(
        url,
        {
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: "initialize",
          params: {
            protocolVersion: MCP_VERSION,
            capabilities: {},
            clientInfo: { name: GATEWAY_NAME, version: GATEWAY_VERSION },
          },
        },
        upstreamTimeoutMs
      );
      const info = init?.result?.serverInfo;
      if (info?.name) {
        name = info.name;
      }
      if (init?.result?.instructions) {
        description = init.result.instructions;
      }
      await notifyJsonRpc(
        url,
        {
          jsonrpc: "2.0",
          method: "notifications/initialized",
          params: {},
        },
        upstreamTimeoutMs
      );
    } catch {
      // Best-effort discovery; fallback to URL-derived name.
    }
    if (!name) {
      name = url;
    }
    const id = entry.id || deriveNodeId(url);
    nodes.push({ id, name, description, url });
  }
  return nodes;
}

async function listNodeTools(env, node) {
  const upstreamTimeoutMs = parsePositiveInt(env.UPSTREAM_TIMEOUT_MS, DEFAULT_UPSTREAM_TIMEOUT_MS);
  const data = await postJsonRpc(
    node.url,
    {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/list",
      params: {},
    },
    upstreamTimeoutMs
  );
  return data?.result?.tools || [];
}

export async function callNodeTool(env, node, toolName, args) {
  const upstreamTimeoutMs = parsePositiveInt(env.UPSTREAM_TIMEOUT_MS, DEFAULT_UPSTREAM_TIMEOUT_MS);
  const data = await postJsonRpc(
    node.url,
    {
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: {
        name: toolName,
        arguments: args || {},
      },
    },
    upstreamTimeoutMs
  );
  return data?.result?.content || [];
}

export async function discoverNodesWithCache(env) {
  const cacheKey = nodesCacheKey(env);
  const ttl = parsePositiveInt(env.NODE_DISCOVERY_CACHE_TTL, DEFAULT_NODE_DISCOVERY_CACHE_TTL);
  const start = nowMs();
  const cached = await redisGetJson(env, cacheKey);
  if (Array.isArray(cached)) {
    return {
      nodes: cached,
      meta: { cache_hit: true, cache_key: cacheKey, cache_ttl_seconds: ttl, latency_ms: nowMs() - start },
    };
  }
  const fresh = await discoverNodes(env);
  await redisSetJson(env, cacheKey, ttl, fresh);
  return {
    nodes: fresh,
    meta: { cache_hit: false, cache_key: cacheKey, cache_ttl_seconds: ttl, latency_ms: nowMs() - start },
  };
}

export async function listNodeToolsWithCache(env, node) {
  const ttl = parsePositiveInt(env.NODE_TOOLS_CACHE_TTL, DEFAULT_NODE_TOOLS_CACHE_TTL);
  const key = nodeToolsCacheKey(node);
  const start = nowMs();
  const cached = await redisGetJson(env, key);
  if (Array.isArray(cached)) {
    return {
      tools: cached,
      meta: { cache_hit: true, cache_key: key, cache_ttl_seconds: ttl, latency_ms: nowMs() - start },
    };
  }
  const tools = await listNodeTools(env, node);
  await redisSetJson(env, key, ttl, tools);
  return {
    tools,
    meta: { cache_hit: false, cache_key: key, cache_ttl_seconds: ttl, latency_ms: nowMs() - start },
  };
}

export function resolveNode(discovered, nodeId) {
  return findNode(discovered.nodes, nodeId);
}
