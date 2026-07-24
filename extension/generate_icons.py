"""Generate simple PNG icons for the Money Whisperer extension."""
from __future__ import annotations

import struct
import zlib
from pathlib import Path


def create_png(width: int, height: int, r: int, g: int, b: int, a: int = 255) -> bytes:
    """Create a minimal solid-color PNG."""

    def chunk(chunk_type: bytes, data: bytes) -> bytes:
        c = chunk_type + data
        crc = struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
        return struct.pack(">I", len(data)) + c + crc

    # PNG signature
    signature = b"\x89PNG\r\n\x1a\n"

    # IHDR: width, height, bit_depth=8, color_type=6 (RGBA), compression=0, filter=0, interlace=0
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    ihdr = chunk(b"IHDR", ihdr_data)

    # Raw pixel data: filter byte (0 = None) + RGBA for each pixel in each row
    raw_data = bytearray()
    for _ in range(height):
        raw_data.append(0)  # filter: none
        for _ in range(width):
            raw_data.extend([r, g, b, a])

    idat = chunk(b"IDAT", zlib.compress(bytes(raw_data)))

    # IEND
    iend = chunk(b"IEND", b"")

    return signature + ihdr + idat + iend


def main():
    icons_dir = Path(__file__).resolve().parent / "icons"
    icons_dir.mkdir(exist_ok=True)

    # Dark ink color matching the app theme
    ink_r, ink_g, ink_b = 0x1E, 0x24, 0x22

    sizes = {"icon16.png": 16, "icon48.png": 48, "icon128.png": 128}

    for filename, size in sizes.items():
        png_bytes = create_png(size, size, ink_r, ink_g, ink_b)
        path = icons_dir / filename
        path.write_bytes(png_bytes)
        print(f"  ✓ {path} ({size}x{size}, {len(png_bytes)} bytes)")

    print("\nIcons generated successfully!")


if __name__ == "__main__":
    main()
