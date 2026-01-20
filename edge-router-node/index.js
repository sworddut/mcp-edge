import express from "express";
import { randomUUID } from "crypto";

const app = express();
app.use(express.json({ limit: "1mb" }));

const TOOL_CATALOG = [
  {
    name: "math_add",
    description: "Add two numbers.",
    input_schema: {
      type: "object",
      properties: { a: { type: "number" }, b: { type: "number" } },
      required: ["a", "b"],
    },
    output_schema: {
      type: "object",
      properties: { sum: { type: "number" } },
      required: ["sum"],
    },
    tags: ["math"],
    risk_level: "low",
    version: "1.0",
  },
  {
    name: "web_search",
    description: "Search the web (demo, fake results).",
    input_schema: {
      type: "object",
      properties: { q: { type: "string" } },
      required: ["q"],
    },
    output_schema: {
      type: "object",
      properties: {
        q: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              url: { type: "string" },
            },
            required: ["title", "url"],
          },
        },
      },
      required: ["q", "items"],
    },
    tags: ["search"],
    risk_level: "medium",
    version: "1.0",
  },
  {
    name: "get_weather",
    description: "Get a weather forecast for the user's edge city.",
    input_schema: { type: "object", properties: {} },
    output_schema: {
      type: "object",
      properties: {
        city: { type: "string" },
        forecast: { type: "string" },
        temp_c: { type: "number" },
      },
      required: ["city", "forecast", "temp_c"],
    },
    tags: ["weather"],
    risk_level: "low",
    version: "1.0",
  },
  {
    name: "twitter_top_topics",
    description: "List top Twitter topics (demo, fake results).",
    input_schema: {
      type: "object",
      properties: { limit: { type: "number" } },
    },
    output_schema: {
      type: "object",
      properties: {
        topics: { type: "array", items: { type: "string" } },
      },
      required: ["topics"],
    },
    tags: ["social"],
    risk_level: "high",
    version: "1.0",
  },
];

const ROUTES = {
  math_add: { backend: "nodeA", url: "http://localhost:8001/mcp/call" },
  web_search: { backend: "nodeB", url: "http://localhost:8002/mcp/call" },
  twitter_top_topics: { backend: "nodeC", url: "http://localhost:8003/mcp/call" },
  get_weather: { backend: "nodeD", url: "http://localhost:8004/mcp/call" },
};

const NODE_MAP = {
  nodeA: { baseUrl: "http://localhost:8001", name: "NodeA", description: "Math tools" },
  nodeB: { baseUrl: "http://localhost:8002", name: "NodeB", description: "Search tools" },
  nodeC: { baseUrl: "http://localhost:8003", name: "NodeC", description: "Social tools" },
  nodeD: { baseUrl: "http://localhost:8004", name: "NodeD", description: "Weather tools" },
};

const TOOL_ACCESS = {
  free: new Set(["math_add", "web_search", "get_weather"]),
  pro: new Set(["math_add", "web_search", "get_weather", "twitter_top_topics"]),
};

function getTenantTools(tenantId) {
  const allowed = TOOL_ACCESS[tenantId] || new Set();
  return TOOL_CATALOG.filter((t) => allowed.has(t.name));
}

const NODE_ACCESS = {
  free: new Set(["nodeA", "nodeB", "nodeD"]),
  pro: new Set(["nodeA", "nodeB", "nodeC", "nodeD"]),
};

function getTenantNodes(tenantId) {
  const allowed = NODE_ACCESS[tenantId] || new Set();
  return Object.entries(NODE_MAP)
    .filter(([id]) => allowed.has(id))
    .map(([id, node]) => ({
      id,
      name: node.name,
      description: node.description,
      tags: [],
      risk_level: "low",
      version: "1.0",
    }));
}

function validateArgs(toolName, args) {
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    return "arguments must be an object";
  }
  if (toolName === "math_add") {
    if (typeof args.a !== "number" || typeof args.b !== "number") {
      return "math_add requires numeric a and b";
    }
  }
  if (toolName === "web_search") {
    if (typeof args.q !== "string") {
      return "web_search requires string q";
    }
  }
  if (toolName === "twitter_top_topics") {
    if (args.limit !== undefined && typeof args.limit !== "number") {
      return "twitter_top_topics limit must be a number";
    }
  }
  return null;
}

app.get("/mcp/tools", async (req, res) => {
  const tenantId = (req.header("x-tenant-id") || "free").toLowerCase();
  const nodeId = req.query.node;
  if (!nodeId) {
    return res.json({ nodes: getTenantNodes(tenantId) });
  }

  const allowedNodes = NODE_ACCESS[tenantId] || new Set();
  if (!allowedNodes.has(nodeId)) {
    return res
      .status(403)
      .json({ error: "forbidden", reason: "node not allowed" });
  }

  const node = NODE_MAP[nodeId];
  if (!node) {
    return res.status(400).json({ error: "invalid_request", reason: "unknown node" });
  }

  try {
    const upstream = await fetch(`${node.baseUrl}/mcp/tools`, {
      method: "GET",
      headers: { "content-type": "application/json" },
    });
    if (!upstream.ok) {
      return res.status(502).json({ error: "upstream_error", backend: nodeId });
    }
    const data = await upstream.json();
    return res.json({ node: nodeId, tools: data.tools || [] });
  } catch (err) {
    return res.status(502).json({ error: "upstream_error", backend: nodeId });
  }
});

app.post("/mcp/call", async (req, res) => {
  const traceId = randomUUID();
  const tenantId = (req.header("x-tenant-id") || "free").toLowerCase();
  const { tool_name: toolName, arguments: args } = req.body || {};

  if (!toolName || typeof toolName !== "string") {
    return res
      .status(400)
      .json({ error: "invalid_request", reason: "tool_name required", trace_id: traceId });
  }

  const allowed = TOOL_ACCESS[tenantId] || new Set();
  if (!allowed.has(toolName)) {
    return res
      .status(403)
      .json({ error: "forbidden", reason: "tool not allowed", trace_id: traceId });
  }

  const validationError = validateArgs(toolName, args || {});
  if (validationError) {
    return res
      .status(400)
      .json({ error: "invalid_arguments", reason: validationError, trace_id: traceId });
  }

  const route = ROUTES[toolName];
  if (!route) {
    return res
      .status(400)
      .json({ error: "invalid_request", reason: "unknown tool", trace_id: traceId });
  }

  const injectedContext =
    toolName === "get_weather"
      ? { city: req.header("x-edge-city") || "Unknown" }
      : undefined;

  const payload = {
    tool_name: toolName,
    arguments: args || {},
    trace_id: traceId,
    ...(injectedContext ? { injected_context: injectedContext } : {}),
  };

  const start = Date.now();
  try {
    const upstream = await fetch(route.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      return res
        .status(502)
        .json({ error: "upstream_error", backend: route.backend, trace_id: traceId });
    }
    const data = await upstream.json();
    const latencyMs = Date.now() - start;
    return res.json({
      trace_id: traceId,
      backend: route.backend,
      tool_name: toolName,
      result: data.result,
      latency_ms: latencyMs,
    });
  } catch (err) {
    return res
      .status(502)
      .json({ error: "upstream_error", backend: route.backend, trace_id: traceId });
  }
});

const port = process.env.PORT || 8787;
app.listen(port, () => {
  console.log(`Edge router (Node) listening on http://localhost:${port}`);
});
