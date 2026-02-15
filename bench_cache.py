import argparse
import asyncio
import json
import statistics
import time
import uuid

import httpx


DEFAULT_MCP_URL = "http://localhost:8787/mcp"


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


async def _mcp_request(client: httpx.AsyncClient, mcp_url: str, method: str, params: dict):
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
    res.raise_for_status()
    content_type = res.headers.get("content-type", "")
    if "text/event-stream" in content_type:
        data_lines = [
            line.strip()[5:].strip()
            for line in res.text.splitlines()
            if line.strip().startswith("data:")
        ]
        if not data_lines:
            raise RuntimeError("empty sse response")
        data = json.loads(data_lines[-1])
    else:
        data = res.json()
    if "error" in data:
        raise RuntimeError(f"mcp error: {data['error']}")
    return data["result"]


async def _call_tool(client: httpx.AsyncClient, mcp_url: str, tool_name: str, arguments: dict):
    result = await _mcp_request(
        client,
        mcp_url,
        "tools/call",
        {"name": tool_name, "arguments": arguments},
    )
    return _extract_content(result)


def _ms(seconds: float) -> float:
    return seconds * 1000


def _p95(samples):
    if len(samples) == 1:
        return samples[0]
    return statistics.quantiles(samples, n=100, method="inclusive")[94]


def _print_stats(title: str, samples):
    avg = statistics.mean(samples)
    p95 = _p95(samples)
    print(f"{title}:")
    print(f"  count={len(samples)} avg={avg:.2f}ms p95={p95:.2f}ms min={min(samples):.2f}ms max={max(samples):.2f}ms")


async def benchmark(mcp_url: str, rounds: int):
    async with httpx.AsyncClient(timeout=30, trust_env=False) as client:
        print(f"mcp_url: {mcp_url}")
        print(f"rounds: {rounds}\n")

        # list_nodes: cold (likely cache miss)
        t0 = time.perf_counter()
        nodes_res = await _call_tool(client, mcp_url, "list_nodes", {})
        cold_list_nodes = _ms(time.perf_counter() - t0)

        nodes = nodes_res.get("nodes", [])
        if not nodes:
            raise RuntimeError("list_nodes returned empty nodes")
        node_id = nodes[0]["id"]
        print(f"sample node_id for list_node_tools: {node_id}\n")

        # list_nodes: warm (cache hit expected)
        warm_list_nodes = []
        for _ in range(rounds):
            t0 = time.perf_counter()
            await _call_tool(client, mcp_url, "list_nodes", {})
            warm_list_nodes.append(_ms(time.perf_counter() - t0))

        # list_node_tools: cold (likely first miss for this node)
        t0 = time.perf_counter()
        await _call_tool(client, mcp_url, "list_node_tools", {"node_id": node_id})
        cold_list_tools = _ms(time.perf_counter() - t0)

        # list_node_tools: warm (cache hit expected)
        warm_list_tools = []
        for _ in range(rounds):
            t0 = time.perf_counter()
            await _call_tool(client, mcp_url, "list_node_tools", {"node_id": node_id})
            warm_list_tools.append(_ms(time.perf_counter() - t0))

        print("Cold (cache miss candidate):")
        print(f"  list_nodes      {cold_list_nodes:.2f}ms")
        print(f"  list_node_tools {cold_list_tools:.2f}ms\n")

        _print_stats("Warm (cache hit candidate) - list_nodes", warm_list_nodes)
        _print_stats("Warm (cache hit candidate) - list_node_tools", warm_list_tools)

        speedup_nodes = cold_list_nodes / statistics.mean(warm_list_nodes)
        speedup_tools = cold_list_tools / statistics.mean(warm_list_tools)
        print("\nSpeedup (cold / warm_avg):")
        print(f"  list_nodes      x{speedup_nodes:.2f}")
        print(f"  list_node_tools x{speedup_tools:.2f}")


def main():
    parser = argparse.ArgumentParser(description="Benchmark MCP gateway cache effect.")
    parser.add_argument("--mcp-url", default=DEFAULT_MCP_URL, help="MCP gateway URL")
    parser.add_argument("--rounds", type=int, default=20, help="Warm rounds for each tool")
    args = parser.parse_args()
    asyncio.run(benchmark(args.mcp_url, args.rounds))


if __name__ == "__main__":
    main()
