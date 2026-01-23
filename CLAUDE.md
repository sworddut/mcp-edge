# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an MCP (Model Context Protocol) Edge Router demo that implements a gateway pattern for distributing tool calls across multiple backend MCP nodes. The architecture uses progressive disclosure - the gateway only exposes node discovery and tool listing, then forwards tool calls to the selected node.

## Architecture

### Core Components

1. **Edge Worker Gateway** (`edge-worker/src/worker.js`)
   - Cloudflare Worker that acts as the MCP gateway
   - Implements JSON-RPC over HTTP
   - Routes tool calls to backend nodes based on node_id
   - Configured via `wrangler.toml` with MCP_NODES array

2. **Python Gateway** (`mcp/edge_gateway.py`)
   - Local Python reference implementation using FastMCP
   - Reads node configuration from `mcp_config.json`
   - Provides same gateway functionality as the Edge Worker

3. **MCP Nodes** (`nodes/node_*/main.py`)
   - FastMCP servers running on different ports (8001-8004)
   - Each node exposes specific tool categories:
     - NodeA: Math operations (add, sub, mul, div)
     - NodeB: Search tools
     - NodeC: Social tools
     - NodeD: Weather tools
   - All nodes use stateless HTTP transport at `/mcp` endpoint

4. **Test Agent** (`test.py`)
   - OpenAI SDK-based agent that connects to the gateway
   - Demonstrates tool discovery and invocation through the gateway

### Gateway Protocol

The gateway exposes three main tools:
- `list_nodes`: Returns available MCP nodes with metadata
- `list_node_tools`: Lists tools for a specific node_id
- `call_node_tool`: Forwards tool calls to the specified node

Node IDs are derived from URLs (e.g., `http://localhost:8001/mcp` → `localhost-8001-mcp`)

## Development Commands

### Setup Environment

```bash
# Create conda environment
conda create -n llm-agent-env python=3.11
conda activate llm-agent-env

# Install Python dependencies
pip install -r requirements.txt

# Install Node.js dependencies for Edge Worker
cd edge-worker
npm install
cd ..
```

### Run Services

```powershell
# Start all nodes and worker (Windows PowerShell)
powershell -ExecutionPolicy Bypass -File .\start_all.ps1

# Or start services individually:

# Start MCP nodes (each in separate terminal)
conda run -n llm-agent-env python nodes/node_a/main.py  # Port 8001
conda run -n llm-agent-env python nodes/node_b/main.py  # Port 8002
conda run -n llm-agent-env python nodes/node_c/main.py  # Port 8003
conda run -n llm-agent-env python nodes/node_d/main.py  # Port 8004

# Start Edge Worker
cd edge-worker
npx wrangler dev --local
```

### Test the System

```bash
# Test gateway directly with curl
curl -s -X POST http://localhost:8787/mcp \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/list","params":{}}'

# Run the test agent
python test.py
```

### Configuration

1. **Edge Worker nodes** - Edit `edge-worker/wrangler.toml`:
   ```toml
   [vars]
   MCP_NODES = '["http://localhost:8001/mcp","http://localhost:8002/mcp"]'
   ```

2. **Python gateway nodes** - Create `mcp/mcp_config.json` (see `mcp_config.example.json`)

3. **Test agent** - Create `.env` file:
   ```ini
   OPENROUTER_API_KEY=your_key
   OPENROUTER_MODEL=gemini-3-flash-preview
   OPENROUTER_BASE_URL=https://api.chataiapi.com/v1
   MCP_URL=http://localhost:8787/mcp
   ```

## Key Implementation Details

- All MCP nodes must accept `Accept: application/json, text/event-stream` headers
- Node descriptions come from FastMCP `instructions` parameter
- Gateway uses slugified URLs as stable node IDs
- Tool results are extracted from MCP content arrays with JSON parsing
- The system supports both local and remote MCP nodes (configurable via URLs)