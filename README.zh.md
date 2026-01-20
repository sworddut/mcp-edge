# MCP 边缘路由 Demo

一个最小可运行的 Edge MCP 网关 + 后端 MCP 节点示例。网关支持渐进式披露：先暴露节点列表，再按节点返回工具列表，并将工具调用转发到对应节点。

## 项目结构

- `edge-worker/` Cloudflare Worker MCP 网关（JSON-RPC / Streamable HTTP）
- `nodes/` NodeA–D FastMCP 服务器（HTTP `/mcp`）
- `mcp/edge_gateway.py` Python 网关（本地参考）
- `test.py` 简单智能体（OpenAI SDK + MCP）
- `start_all.ps1` 一键启动 NodeA–D + 本地 Worker

## 依赖

- Python 3.10+
- Node.js 18+
- Python 依赖在 `requirements.txt`
- Wrangler（可用 `npx` 运行）

## 安装 Python 依赖

```bash
conda create -n llm-agent-env python=3.11
conda activate llm-agent-env
pip install -r requirements.txt
```

## 本地启动（Windows PowerShell）

### 1）启动 NodeA–D + Worker

```powershell
powershell -ExecutionPolicy Bypass -File .\start_all.ps1
```

说明：`start_all.ps1` 依赖 `conda run -n llm-agent-env ...`。如果不使用 conda，请手动分别启动各节点。

### 2）验证 MCP 网关（JSON-RPC）

```bash
# tools/list（网关工具）
curl -s -X POST http://localhost:8787/mcp \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'

# list_nodes（渐进式披露）
curl -s -X POST http://localhost:8787/mcp \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":"2","method":"tools/call","params":{"name":"list_nodes","arguments":{}}}'

# list_node_tools
curl -s -X POST http://localhost:8787/mcp \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":"3","method":"tools/call","params":{"name":"list_node_tools","arguments":{"node_id":"localhost-8001-mcp"}}}'

# call_node_tool
curl -s -X POST http://localhost:8787/mcp \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":"4","method":"tools/call","params":{"name":"call_node_tool","arguments":{"node_id":"localhost-8001-mcp","tool_name":"math_add","arguments":{"a":2,"b":3}}}}'
```

## 智能体测试（OpenAI SDK + OpenRouter 兼容）

1）在仓库根目录创建 `.env`：

```ini
OPENROUTER_API_KEY=your_key
OPENROUTER_MODEL=gemini-3-flash-preview
OPENROUTER_BASE_URL=https://api.chataiapi.com/v1
MCP_URL=http://localhost:8787/mcp
```

2）运行：

```powershell
python .\test.py
```

## Cloudflare Worker

在 `edge-worker/` 目录下：

```bash
npx wrangler dev --local
```

配置 MCP 节点 URL（`edge-worker/wrangler.toml`）：

```toml
[vars]
MCP_NODES = '["http://localhost:8001/mcp","http://localhost:8002/mcp","http://localhost:8003/mcp","http://localhost:8004/mcp"]'
```

## 说明

- 网关请求下游节点时需要 `Accept: application/json, text/event-stream`。
- 节点描述来自 FastMCP 的 `instructions`。
- 节点 ID 来自 URL（稳定且可复用）。
