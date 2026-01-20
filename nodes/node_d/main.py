import os

from fastmcp import FastMCP

mcp = FastMCP(
    "NodeD",
    instructions="Weather tools for demo forecasts by city.",
)


@mcp.tool
def get_weather(city: str | None = None) -> dict:
    """Return a demo weather forecast for the given city."""
    return {"city": city or "Unknown", "forecast": "Sunny", "temp_c": 20}


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8004"))
    mcp.run(
        transport="http",
        host="0.0.0.0",
        port=port,
        path="/mcp",
        stateless_http=True,
    )
