import { GATEWAY_NAME, GATEWAY_VERSION, MCP_VERSION, TOOL_DEFS } from "./constants.js";
import { asJsonRpcError, asJsonRpcResult, jsonResponse } from "./helpers.js";
import { handleToolCall } from "./tool-handler.js";

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
