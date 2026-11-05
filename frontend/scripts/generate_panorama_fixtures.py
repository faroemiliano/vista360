"""Genera grillas equirectangulares propias 2:1, sin dependencias externas."""

from pathlib import Path
import struct
import zlib

OUTPUT = Path(__file__).resolve().parents[1] / "public" / "panoramas"


def chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack("!I", len(data)) + kind + data + struct.pack("!I", zlib.crc32(kind + data))


def generate(name: str, width: int, palette: tuple[int, int, int]) -> None:
    height = width // 2
    rows = bytearray()
    step = width / 12  # Meridianos cada 30 grados.
    line = max(2, width // 1024)
    for y in range(height):
        row = bytearray(b"\x00")  # Filtro PNG: none.
        horizontal = y % (height // 6) < line
        for band in range(12):
            start = round(band * step)
            end = round((band + 1) * step)
            shade = 18 if band % 2 else 0
            if y < height // 3:
                color = tuple(min(255, c + 80 + shade) for c in palette)
            elif y >= height * 2 // 3:
                color = tuple(max(0, c - 25 + shade) for c in palette)
            else:
                color = tuple(min(255, c + shade) for c in palette)
            if horizontal:
                row.extend(bytes((235, 240, 242)) * (end - start))
            else:
                row.extend(bytes((235, 240, 242)) * line)
                row.extend(bytes(color) * (end - start - line))
        rows.extend(row)
    header = struct.pack("!IIBBBBB", width, height, 8, 2, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
    png += chunk(b"IDAT", zlib.compress(rows, level=9)) + chunk(b"IEND", b"")
    target = OUTPUT / f"{name}-{width}.png"
    target.write_bytes(png)
    print(f"{target.name}: {width}x{height}, {len(png)} bytes")


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for name, palette in [("atrio", (42, 106, 105)), ("sala", (149, 91, 47))]:
        for width in (4096, 2048):
            generate(name, width, palette)
