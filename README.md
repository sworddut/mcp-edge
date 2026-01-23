# MCP Edge Router Demo

[中文说明](README.zh.md)

Minimal demo of an Edge MCP router (Cloudflare Worker) with backend MCP nodes (FastMCP).
It supports progressive disclosure: the gateway only exposes node discovery and tool
listing, then forwards tool calls to the selected node.

## Architecture Overview

![MCP Edge Router - Progressive Disclosure Pattern](static/imgs/交互.png)

The diagram above illustrates the multi-round interaction pattern and progressive disclosure mechanism of the MCP Edge Router, showing how the LLM Agent discovers nodes, queries tools, and executes operations through the gateway.

## Project Layout

- `edge-worker/` Cloudflare Worker MCP gateway (JSON-RPC over Streamable HTTP)
- `nodes/` NodeA–D FastMCP servers (HTTP `/mcp`)
- `mcp/edge_gateway.py` Python gateway (local reference)
- `test.py` Simple LLM agent (OpenAI SDK + MCP)
- `start_all.ps1` Start NodeA–D + local Worker

![Code Architecture](static/imgs/代码架构.png)

## Prerequisites

- Python 3.10+
- Node.js 18+
- Core Python deps in `requirements.txt`
- Wrangler (via `npx` is fine)

## Install Python Dependencies

```bash
conda create -n llm-agent-env python=3.11
conda activate llm-agent-env
pip install -r requirements.txt
```

## Local Run (Windows PowerShell)

### 1) Start NodeA–D + Worker

```powershell
powershell -ExecutionPolicy Bypass -File .\start_all.ps1
```

Note: `start_all.ps1` uses `conda run -n llm-agent-env ...`. If you don't use conda, start each node manually.

### 2) Validate MCP Gateway (JSON-RPC)

```bash
# list tools (gateway tools)
curl -s -X POST http://localhost:8787/mcp \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'

# list nodes (progressive disclosure)
curl -s -X POST http://localhost:8787/mcp \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":"2","method":"tools/call","params":{"name":"list_nodes","arguments":{}}}'

# list node tools
curl -s -X POST http://localhost:8787/mcp \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":"3","method":"tools/call","params":{"name":"list_node_tools","arguments":{"node_id":"localhost-8001-mcp"}}}'

# call node tool
curl -s -X POST http://localhost:8787/mcp \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":"4","method":"tools/call","params":{"name":"call_node_tool","arguments":{"node_id":"localhost-8001-mcp","tool_name":"math_add","arguments":{"a":2,"b":3}}}}'
```

## Agent Test (OpenAI SDK + OpenRouter-compatible)

1) Create `.env` at repo root (see `.env.example`):

```ini
OPENROUTER_API_KEY=your_key
OPENROUTER_MODEL=gemini-3-flash-preview
OPENROUTER_BASE_URL=https://api.chataiapi.com/v1
MCP_URL=http://localhost:8787/mcp
```

2) Run:

```powershell
python .\test.py
```

For extensible MCP server config, see `mcp/mcp_config.example.json` (includes a remote MCP example).

## Cloudflare Worker

From `edge-worker/`:

```bash
npx wrangler dev --local
```

Configure MCP node URLs in `edge-worker/wrangler.toml`:

```toml
[vars]
MCP_NODES = '["http://localhost:8001/mcp","http://localhost:8002/mcp","http://localhost:8003/mcp","http://localhost:8004/mcp"]'
```

## Notes

- Gateway expects MCP nodes to accept `application/json, text/event-stream`.
- Node descriptions come from `FastMCP` `instructions` (see each node).
- Node IDs are derived from URL (stable across restarts).
