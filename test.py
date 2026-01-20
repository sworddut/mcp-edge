import asyncio
import json
import os
import uuid


from dotenv import load_dotenv


import httpx
from openai import OpenAI



DEFAULT_MCP_URL = "http://localhost:8787/mcp"
DEFAULT_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_OPENROUTER_MODEL = "openai/gpt-4o-mini"


def _tool_defs():
    return [
        {
            "type": "function",
            "function": {
                "name": "list_nodes",
                "description": "List available MCP nodes discovered from configured URLs.",
                "parameters": {"type": "object", "properties": {}},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "list_node_tools",
                "description": "List tools for a specific node.",
                "parameters": {
                    "type": "object",
                    "properties": {"node_id": {"type": "string"}},
                    "required": ["node_id"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "call_node_tool",
                "description": "Call a tool on a specific node.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "node_id": {"type": "string"},
                        "tool_name": {"type": "string"},
                        "arguments": {"type": "object"},
                    },
                    "required": ["node_id", "tool_name"],
                },
            },
        },
    ]


def _extract_content(result: dict):
    contents = result.get("content") or []
    if contents and isinstance(contents, list):
        first = contents[0] or {}
        if first.get("type") == "text":
            text = first.get("text", "")
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                return {"text": text}
    return result


async def _mcp_request(
    client: httpx.AsyncClient, mcp_url: str, method: str, params: dict
):
    payload = {
        "jsonrpc": "2.0",
        "id": str(uuid.uuid4()),
        "method": method,
        "params": params,
    }
    res = await client.post(
        mcp_url,
        headers={
            "content-type": "application/json",
            "accept": "application/json, text/event-stream",
        },
        json=payload,
    )
    if not res.is_success:
        print("mcp_url:", mcp_url)
        print("mcp status:", res.status_code)
        print("mcp body:", res.text)
        raise RuntimeError(f"mcp error: {res.status_code} {res.text}")
    content_type = res.headers.get("content-type", "")
    if "text/event-stream" in content_type:
        data_lines = [
            line.strip()[5:].strip()
            for line in res.text.splitlines()
            if line.strip().startswith("data:")
        ]
        if not data_lines:
            raise RuntimeError("mcp error: empty sse response")
        data = json.loads(data_lines[-1])
    else:
        data = res.json()
    if "error" in data:
        raise RuntimeError(f"mcp error: {data['error']}")
    return data["result"]


async def _call_gateway_tool(mcp_url: str, tool_name: str, arguments: dict):
    async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
        result = await _mcp_request(
            client,
            mcp_url,
            "tools/call",
            {"name": tool_name, "arguments": arguments},
        )
    return _extract_content(result)


def _load_dotenv_fallback(path: str) -> None:
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            raw = line.strip()
            if not raw or raw.startswith("#") or "=" not in raw:
                continue
            key, value = raw.split("=", 1)
            key = key.strip()
            value = value.strip().strip("'").strip('"')
            if key and key not in os.environ:
                os.environ[key] = value


async def main():
    env_path = os.path.join(os.path.dirname(__file__), ".env")
    if load_dotenv:
        load_dotenv(env_path, override=True)
    else:
        _load_dotenv_fallback(env_path)
    mcp_url = os.getenv("MCP_URL", DEFAULT_MCP_URL)
    base_url = os.getenv("OPENROUTER_BASE_URL", DEFAULT_OPENROUTER_BASE_URL)
    model = os.getenv("OPENROUTER_MODEL", DEFAULT_OPENROUTER_MODEL)
    print("base_url:", base_url)
    print("model:", model)
    print("mcp_url:", mcp_url)
    api_key = os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY")
    print("has_api_key:", bool(api_key))
    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY (or OPENAI_API_KEY) is required")

    user_query = os.getenv(
        "USER_QUERY",
        "请通过MCP计算 2+3，并返回结果。",
    )

    client = OpenAI(api_key=api_key, base_url=base_url)

    messages = [
        {
            "role": "system",
            "content": (
                "You are a helpful assistant. Use the MCP tools when needed. "
                "Use list_nodes then list_node_tools to discover tools before calling them."
            ),
        },
        {"role": "user", "content": user_query},
    ]

    tools = _tool_defs()

    while True:
        print("\n--- LLM request ---")
        print("user_query:", user_query)
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            tools=tools,
        )
        msg = resp.choices[0].message
        if not msg.tool_calls:
            print("\n--- LLM final response ---")
            print(msg.content)
            break

        print("\n--- LLM tool calls ---")
        for call in msg.tool_calls:
            print("tool:", call.function.name)
            print("args:", call.function.arguments)
        messages.append(msg)
        for tool_call in msg.tool_calls:
            name = tool_call.function.name
            args = json.loads(tool_call.function.arguments or "{}")
            print("\n--- MCP call ---")
            print("tool:", name)
            print("args:", args)
            result = await _call_gateway_tool(mcp_url, name, args)
            print("--- MCP result ---")
            print(result)
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(result, ensure_ascii=False),
                }
            )


asyncio.run(main())
