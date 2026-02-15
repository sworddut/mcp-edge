import { textContent } from "./helpers.js";
import {
  callNodeTool,
  discoverNodesWithCache,
  listNodeToolsWithCache,
  resolveNode,
} from "./node-service.js";

export async function handleToolCall(env, toolName, args) {
  if (toolName === "list_nodes") {
    const discovered = await discoverNodesWithCache(env);
    console.log(JSON.stringify({ event: "list_nodes", ...discovered.meta }));
    return {
      content: textContent({
        nodes: discovered.nodes.map(({ id, name, description, url }) => ({
          id,
          name,
          description,
          url,
        })),
        _meta: discovered.meta,
      }),
    };
  }

  if (toolName === "list_node_tools") {
    const nodeId = args?.node_id;
    if (!nodeId) {
      return { content: textContent({ error: "node_id required" }), isError: true };
    }
    const discovered = await discoverNodesWithCache(env);
    const node = resolveNode(discovered, nodeId);
    if (!node) {
      return { content: textContent({ error: "unknown node" }), isError: true };
    }

    const toolsResult = await listNodeToolsWithCache(env, node);
    const meta = { ...toolsResult.meta, nodes_cache_hit: discovered.meta.cache_hit };
    console.log(JSON.stringify({ event: "list_node_tools", node_id: nodeId, ...meta }));
    return { content: textContent({ node: nodeId, tools: toolsResult.tools, _meta: meta }) };
  }

  if (toolName === "call_node_tool") {
    const nodeId = args?.node_id;
    const targetTool = args?.tool_name;
    const argumentsObj = args?.arguments || {};
    if (!nodeId || !targetTool) {
      return { content: textContent({ error: "node_id and tool_name required" }), isError: true };
    }

    const discovered = await discoverNodesWithCache(env);
    const node = resolveNode(discovered, nodeId);
    if (!node) {
      return { content: textContent({ error: "unknown node" }), isError: true };
    }

    const content = await callNodeTool(env, node, targetTool, argumentsObj);
    console.log(
      JSON.stringify({
        event: "call_node_tool",
        node_id: nodeId,
        tool_name: targetTool,
        nodes_cache_hit: discovered.meta.cache_hit,
      })
    );
    return { content };
  }

  return { content: textContent({ error: "unknown tool" }), isError: true };
}
