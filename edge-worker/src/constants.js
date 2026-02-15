export const MCP_VERSION = "2024-11-05";
export const GATEWAY_NAME = "edge-mcp-gateway";
export const GATEWAY_VERSION = "0.1.0";

export const DEFAULT_NODE_DISCOVERY_CACHE_TTL = 10;
export const DEFAULT_NODE_TOOLS_CACHE_TTL = 30;
export const DEFAULT_UPSTREAM_TIMEOUT_MS = 5000;

export const TOOL_DEFS = [
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
