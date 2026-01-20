import os

from fastmcp import FastMCP

mcp = FastMCP(
    "NodeC",
    instructions="Social trend tools for demo Twitter-like topics.",
)


@mcp.tool
def twitter_top_topics(limit: int = 5) -> dict:
    """Return a list of demo trending topics."""
    topics = [
        "AI Agents",
        "Edge Computing",
        "Cloudflare Workers",
        "MCP Protocol",
        "Serverless Routers",
        "FastAPI",
        "Observability",
    ]
    return {"topics": topics[: int(limit)]}


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8003"))
    mcp.run(
        transport="http",
        host="0.0.0.0",
        port=port,
        path="/mcp",
        stateless_http=True,
    )
