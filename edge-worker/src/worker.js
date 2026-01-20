const MCP_VERSION = "2024-11-05";
const GATEWAY_NAME = "edge-mcp-gateway";
const GATEWAY_VERSION = "0.1.0";

const TOOL_DEFS = [
  {
    name: "list_nodes",
    description: "List available MCP nodes discovered from configured URLs.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_node_tools",
    description: "List tools for a specific node.",
    inputSchema: {
      type: "object",
      properties: { node_id: { type: "string" } },
      required: ["node_id"],
    },
  },
  {
    name: "call_node_tool",
    description: "Call a tool on a specific node.",
    inputSchema: {
      type: "object",
      properties: {
        node_id: { type: "string" },
        tool_name: { type: "string" },
        arguments: { type: "object" },
      },
      required: ["node_id", "tool_name"],
    },
  },
];

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function asJsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

function asJsonRpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return { jsonrpc: "2.0", id, error };
}

function parseNodeUrls(env) {
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

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function deriveNodeId(url) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    return slugify(`${parsed.host}${path}`);
  } catch {
    return slugify(url);
  }
}

function textContent(payload) {
  return [{ type: "text", text: JSON.stringify(payload) }];
}

async function postJsonRpc(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
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

async function notifyJsonRpc(url, body) {
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(body),
    });
  } catch {
    // Ignore notify failures.
  }
}

async function discoverNodes(env) {
  const entries = parseNodeUrls(env);
  const nodes = [];
  for (const entry of entries) {
    const url = entry.url;
    let name = entry.name || "";
    let description = entry.description || "";
    try {
      const init = await postJsonRpc(url, {
        jsonrpc: "2.0",
        id: crypto.randomUUID(),
        method: "initialize",
        params: {
          protocolVersion: MCP_VERSION,
          capabilities: {},
          clientInfo: { name: GATEWAY_NAME, version: GATEWAY_VERSION },
        },
      });
      const info = init?.result?.serverInfo;
      if (info?.name) {
        name = info.name;
      }
      if (init?.result?.instructions) {
        description = init.result.instructions;
      }
      await notifyJsonRpc(url, {
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      });
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

async function listNodeTools(node) {
  const data = await postJsonRpc(node.url, {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "tools/list",
    params: {},
  });
  return data?.result?.tools || [];
}

async function callNodeTool(node, toolName, args) {
  const data = await postJsonRpc(node.url, {
    jsonrpc: "2.0",
    id: crypto.randomUUID(),
    method: "tools/call",
    params: {
      name: toolName,
      arguments: args || {},
    },
  });
  return data?.result?.content || [];
}

async function handleToolCall(env, toolName, args) {
  if (toolName === "list_nodes") {
    const nodes = await discoverNodes(env);
    return {
      content: textContent({
        nodes: nodes.map(({ id, name, description, url }) => ({
          id,
          name,
          description,
          url,
        })),
      }),
    };
  }
  if (toolName === "list_node_tools") {
    const nodeId = args?.node_id;
    if (!nodeId) {
      return { content: textContent({ error: "node_id required" }), isError: true };
    }
    const nodes = await discoverNodes(env);
    const normalized = String(nodeId).toLowerCase();
    const node = nodes.find((n) => {
      if (n.id === nodeId || n.url === nodeId || n.name === nodeId) {
        return true;
      }
      if (n.name && n.name.toLowerCase() === normalized) {
        return true;
      }
      if (slugify(n.name || "") === normalized) {
        return true;
      }
      return false;
    });
    if (!node) {
      return { content: textContent({ error: "unknown node" }), isError: true };
    }
    const tools = await listNodeTools(node);
    return { content: textContent({ node: nodeId, tools }) };
  }
  if (toolName === "call_node_tool") {
    const nodeId = args?.node_id;
    const targetTool = args?.tool_name;
    const argumentsObj = args?.arguments || {};
    if (!nodeId || !targetTool) {
      return { content: textContent({ error: "node_id and tool_name required" }), isError: true };
    }
    const nodes = await discoverNodes(env);
    const normalized = String(nodeId).toLowerCase();
    const node = nodes.find((n) => {
      if (n.id === nodeId || n.url === nodeId || n.name === nodeId) {
        return true;
      }
      if (n.name && n.name.toLowerCase() === normalized) {
        return true;
      }
      if (slugify(n.name || "") === normalized) {
        return true;
      }
      return false;
    });
    if (!node) {
      return { content: textContent({ error: "unknown node" }), isError: true };
    }
    const content = await callNodeTool(node, targetTool, argumentsObj);
    return { content };
  }
  return { content: textContent({ error: "unknown tool" }), isError: true };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/mcp") {
      return jsonResponse({ error: "not_found" }, 404);
    }

    let message;
    try {
      message = await request.json();
    } catch {
      return jsonResponse(asJsonRpcError(null, -32700, "Parse error"), 400);
    }

    const { jsonrpc, id, method, params } = message || {};
    if (jsonrpc !== "2.0" || !method) {
      return jsonResponse(asJsonRpcError(id ?? null, -32600, "Invalid Request"), 400);
    }

    if (method === "initialize") {
      return jsonResponse(
        asJsonRpcResult(id, {
          protocolVersion: MCP_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: GATEWAY_NAME, version: GATEWAY_VERSION },
        })
      );
    }

    if (method === "notifications/initialized") {
      return jsonResponse({}, 204);
    }

    if (method === "tools/list") {
      return jsonResponse(
        asJsonRpcResult(id, {
          tools: TOOL_DEFS,
        })
      );
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const args = params?.arguments || {};
      if (!toolName || typeof toolName !== "string") {
        return jsonResponse(
          asJsonRpcError(id ?? null, -32602, "Invalid params", "tool name required"),
          400
        );
      }
      try {
        const result = await handleToolCall(env, toolName, args);
        return jsonResponse(asJsonRpcResult(id, result));
      } catch (err) {
        return jsonResponse(
          asJsonRpcError(id ?? null, -32603, "Internal error", String(err)),
          500
        );
      }
    }

    return jsonResponse(asJsonRpcError(id ?? null, -32601, "Method not found"), 404);
  },
};
