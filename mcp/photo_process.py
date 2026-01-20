from fastmcp import FastMCP
from typing import List
import os

mcp = FastMCP('local-photo-process-server')

@mcp.tool
def process_photo(image_path: str) -> str:
    """Process a photo."""
    return f"Processing photo: {image_path}"

# Helper to simulate output path derivation without real I/O
def _derive_output_path(image_path: str, suffix: str, ext: str = None) -> str:
    base, original_ext = os.path.splitext(image_path)
    out_ext = ext if ext else (original_ext if original_ext else ".jpg")
    return f"{base}__{suffix}{out_ext}"

@mcp.tool
def crop_image(image_path: str, x: int, y: int, width: int, height: int) -> str:
    """cropping an image. Returns a new image path for chaining.

    Args:
        image_path: Input image path (logical path).
        x, y: Top-left corner of the crop box.
        width, height: Size of the crop box.

    Returns:
        A new image path string indicating the cropped result.
    """
    suffix = f"crop_{x}_{y}_{width}_{height}"
    out_path = _derive_output_path(image_path, suffix)
    return out_path

@mcp.tool
def increase_brightness(image_path: str, factor: float = 1.2) -> str:
    """increasing brightness. Returns a new image path for chaining.

    Args:
        image_path: Input image path.
        factor: Brightness scale (>1.0 brighter, <1.0 darker).

    Returns:
        A new image path string indicating the brightness-adjusted result.
    """
    # normalize factor to 2 decimal places to keep path readable
    f = f"{float(factor):.2f}"
    suffix = f"bright_{f}"
    out_path = _derive_output_path(image_path, suffix)
    return out_path

@mcp.tool
def increase_contrast(image_path: str, factor: float = 1.2) -> str:
    """increasing contrast. Returns a new image path for chaining.

    Args:
        image_path: Input image path.
        factor: Contrast scale (>1.0 higher contrast, <1.0 lower).

    Returns:
        A new image path string indicating the contrast-adjusted result.
    """
    f = f"{float(factor):.2f}"
    suffix = f"contrast_{f}"
    out_path = _derive_output_path(image_path, suffix)
    return out_path

@mcp.tool
def process_chain(image_path: str, operations: List[str]) -> str:
    """a chain of operations on an image, in order, for DAG linear flows.

    operations is a list of strings in the set:
      - "crop:x,y,width,height"
      - "brightness:factor"
      - "contrast:factor"

    Example:
      operations=["crop:10,10,100,100", "brightness:1.3", "contrast:1.2"]

    Returns the final image path after applying all simulated steps.
    """
    current = image_path
    for op in operations:
        try:
            if op.startswith("crop:"):
                args = op.split(":", 1)[1]
                x_str, y_str, w_str, h_str = [v.strip() for v in args.split(",")]
                current = crop_image(current, int(x_str), int(y_str), int(w_str), int(h_str))
            elif op.startswith("brightness:"):
                factor = float(op.split(":", 1)[1])
                current = increase_brightness(current, factor)
            elif op.startswith("contrast:"):
                factor = float(op.split(":", 1)[1])
                current = increase_contrast(current, factor)
            else:
                # Unknown op, just annotate path to reflect no-op
                current = _derive_output_path(current, f"noop_{op.replace(':', '_')}")
        except Exception:
            # Be resilient and continue chain, tagging error in the path
            current = _derive_output_path(current, "error_in_step")
    return current

if __name__ == "__main__":
    mcp.run()
