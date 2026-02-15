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
  - `src/worker.js` gateway entrypoint (JSON-RPC routing)
  - `src/tool-handler.js` tool dispatch (`list_nodes` / `list_node_tools` / `call_node_tool`)
  - `src/node-service.js` node discovery, caching, node calls
  - `src/mcp-client.js` upstream JSON-RPC and timeout handling
  - `src/redis.js` Upstash Redis wrapper
  - `src/constants.js` / `src/helpers.js` shared constants and helpers
- `nodes/` NodeA–D FastMCP servers (HTTP `/mcp`)
- `mcp/edge_gateway.py` Python gateway (local reference)
- `test.py` Simple LLM agent (OpenAI SDK + MCP)
- `bench_cache.py` cache benchmark script
- `start_all.ps1` Start NodeA–D + local Worker

![Code Architecture](static/imgs/代码架构.png)

## Prerequisites

- Python 3.10+
- Node.js 18+
- Core Python deps in `requirements.txt`
- Wrangler (via `npx` is fine)

## Install Python Dependencies (recommended: single `uv` env)

```bash
uv venv .venv
uv pip install -r requirements.txt --python .venv/bin/python
source .venv/bin/activate
```

If you prefer conda, you can still use:

```bash
conda create -n llm-agent-env python=3.11
conda activate llm-agent-env
pip install -r requirements.txt
```

## Local Run

### 1) Start NodeA–D + Worker

macOS / Linux (single shared env):

```bash
source .venv/bin/activate
python nodes/node_a/main.py
python nodes/node_b/main.py
python nodes/node_c/main.py
python nodes/node_d/main.py
cd edge-worker && npx wrangler dev --local
```

Windows PowerShell (existing script):

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
NODE_DISCOVERY_CACHE_TTL = "10"
NODE_TOOLS_CACHE_TTL = "30"
UPSTREAM_TIMEOUT_MS = "5000"
```

Optional: enable Upstash Redis cache (for `wrangler dev --local`):

```bash
cd edge-worker
cp .dev.vars.example .dev.vars
# fill real values:
# UPSTASH_REDIS_REST_URL=...
# UPSTASH_REDIS_REST_TOKEN=...
```

Notes:
- Without Upstash vars, gateway falls back to no-Redis mode.
- `edge-worker/.dev.vars` is ignored by git.
- For cloud deployment, use `wrangler secret put ...`.

## Cache Benchmark

From repo root:

```bash
source .venv/bin/activate
python bench_cache.py --mcp-url http://localhost:8787/mcp --rounds 20
```

The script prints cold vs warm latency stats (avg/p95/min/max) for `list_nodes` and `list_node_tools`, plus speedup.

## Notes

- Gateway expects MCP nodes to accept `application/json, text/event-stream`.
- Node descriptions come from `FastMCP` `instructions` (see each node).
- Node IDs are derived from URL (stable across restarts).
