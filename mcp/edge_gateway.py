import asyncio
import json
import os
from typing import Any

from fastmcp import Client, FastMCP

mcp = FastMCP("edge-mcp-gateway")


def _config_path() -> str:
    env_path = os.getenv("EDGE_MCP_CONFIG")
    if env_path:
        return env_path
    return os.path.join(os.path.dirname(__file__), "mcp_config.json")


def _load_config() -> dict:
    with open(_config_path(), "r", encoding="utf-8") as f:
        return json.load(f)


def _node_entries() -> dict[str, dict]:
    config = _load_config()
    return config.get("mcpServers", {})


def _node_meta(node_id: str, cfg: dict) -> dict:
    node_type = "url" if "url" in cfg else "command"
    return {
        "id": node_id,
        "type": node_type,
        "description": cfg.get("description", ""),
        "tags": cfg.get("tags", []),
    }


def _client_for_node(node_id: str) -> Client:
    nodes = _node_entries()
    if node_id not in nodes:
        raise ValueError(f"unknown node: {node_id}")
    config = {"mcpServers": {node_id: nodes[node_id]}}
    return Client(config)


def _tool_to_dict(tool: Any) -> dict:
    if hasattr(tool, "model_dump"):
        return tool.model_dump()
    if hasattr(tool, "__dict__"):
        return dict(tool.__dict__)
    return {
        "name": getattr(tool, "name", ""),
        "description": getattr(tool, "description", ""),
        "inputSchema": getattr(tool, "inputSchema", {}),
    }


def _extract_tool_result(result: Any) -> Any:
    content = getattr(result, "content", result)
    if isinstance(content, list):
        for item in content:
            text = getattr(item, "text", None)
            if text:
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    return {"text": text}
        return content
    return content


@mcp.tool
def list_nodes() -> dict:
    nodes = _node_entries()
    return {"nodes": [_node_meta(node_id, cfg) for node_id, cfg in nodes.items()]}


@mcp.tool
async def list_node_tools(node_id: str) -> dict:
    client = _client_for_node(node_id)
    async with client:
        tools = await client.list_tools()
    return {"node": node_id, "tools": [_tool_to_dict(t) for t in tools]}


@mcp.tool
async def call_node_tool(node_id: str, tool_name: str, arguments: dict | None = None) -> dict:
    args = arguments or {}
    if not isinstance(args, dict):
        return {"error": "invalid_arguments", "reason": "arguments must be an object"}
    client = _client_for_node(node_id)
    async with client:
        result = await client.call_tool(tool_name, args)
    return {"node": node_id, "tool_name": tool_name, "result": _extract_tool_result(result)}


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8787"))
    mcp.run(transport="sse", host="0.0.0.0", port=port)
