import os

from fastmcp import FastMCP

mcp = FastMCP(
    "NodeB",
    instructions="Search tools for demo web lookup and fake results.",
)


@mcp.tool
def web_search(q: str) -> dict:
    """Search the web (demo) and return a few fake results."""
    items = [
        {"title": f"{q} News", "url": "https://example.com/news"},
        {"title": f"{q} Docs", "url": "https://example.com/docs"},
        {"title": f"{q} Tutorial", "url": "https://example.com/tutorial"},
    ]
    return {"q": q, "items": items}


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8002"))
    mcp.run(
        transport="http",
        host="0.0.0.0",
        port=port,
        path="/mcp",
        stateless_http=True,
    )
