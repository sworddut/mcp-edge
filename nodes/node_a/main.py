import os

from fastmcp import FastMCP

mcp = FastMCP(
    "NodeA",
    instructions="Math tools for basic arithmetic and numeric utilities.",
)


@mcp.tool
def math_add(a: float, b: float) -> dict:
    """Add two numbers and return the sum."""
    return {"sum": a + b}

@mcp.tool
def math_sub(a: float, b: float) -> dict:
    """Subtract two numbers and return the difference."""
    return {"difference": a - b}

@mcp.tool
def math_mul(a: float, b: float) -> dict:
    """Multiply two numbers and return the product."""
    return {"product": a * b}

@mcp.tool
def math_div(a: float, b: float) -> dict:
    """Divide two numbers and return the quotient."""
    if b == 0:
        raise ValueError("Division by zero is not allowed.")
    return {"quotient": a / b}

if __name__ == "__main__":
    port = int(os.getenv("PORT", "8001"))
    mcp.run(
        transport="http",
        host="0.0.0.0",
        port=port,
        path="/mcp",
        stateless_http=True,
    )
