#!/usr/bin/env python3
"""Renders the ELO TERRORISTS icon to PNG at the sizes the manifest needs.

No image libraries are available in this environment, so this rasterises the
shape directly: supersample a point-in-shape test, box-filter down for
antialiasing, then write the PNG by hand (zlib + CRC'd chunks).

Geometry is defined on a 128x128 grid and scaled, so every size is redrawn
rather than resampled — the 16px icon keeps clean edges instead of turning to
mush the way a downscaled 128 would.
"""

import struct
import zlib

# ── Palette ──────────────────────────────────────────────────────────────────
TEAL = (28, 199, 165)
DARK = (13, 43, 41)

# ── Geometry, on a 128x128 grid ──────────────────────────────────────────────
TILE_R = 28.0          # rounded-square corner radius

CX      = 64.0
LEFT    = 26.0
RIGHT   = 102.0
HEAD_CY = 66.0
HEAD_R  = (RIGHT - LEFT) / 2.0   # head meets the body flush
BOTTOM  = 99.0

# Two V notches cut up from the bottom edge, leaving three feet.
NOTCH_TOP = 85.0
NOTCHES = [(43.0, 55.5), (72.5, 85.0)]

EYE_R = 8.0
EYES = [(50.0, 60.0), (78.0, 60.0)]


def in_rounded_rect(x, y, size, r):
    if x < 0 or y < 0 or x > size or y > size:
        return False
    # Only the corner quadrants need a distance test.
    cx = r if x < r else (size - r if x > size - r else x)
    cy = r if y < r else (size - r if y > size - r else y)
    dx, dy = x - cx, y - cy
    return dx * dx + dy * dy <= r * r


def in_triangle(px, py, a, b, c):
    def cross(o, u, v):
        return (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0])
    d1 = cross(a, b, (px, py))
    d2 = cross(b, c, (px, py))
    d3 = cross(c, a, (px, py))
    neg = d1 < 0 or d2 < 0 or d3 < 0
    pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (neg and pos)


def in_ghost(x, y):
    if y > BOTTOM:
        return False
    if y < HEAD_CY:
        dx, dy = x - CX, y - HEAD_CY
        if dx * dx + dy * dy > HEAD_R * HEAD_R:
            return False
    elif x < LEFT or x > RIGHT:
        return False

    for x1, x2 in NOTCHES:
        apex = ((x1 + x2) / 2.0, NOTCH_TOP)
        if in_triangle(x, y, (x1, BOTTOM), (x2, BOTTOM), apex):
            return False
    return True


def in_eye(x, y):
    for ex, ey in EYES:
        dx, dy = x - ex, y - ey
        if dx * dx + dy * dy <= EYE_R * EYE_R:
            return True
    return False


def sample(x, y, size):
    """Colour + coverage at one point, in output-pixel coordinates."""
    scale = 128.0 / size
    gx, gy = x * scale, y * scale
    if not in_rounded_rect(gx, gy, 128.0, TILE_R):
        return None
    if in_eye(gx, gy):
        return TEAL
    if in_ghost(gx, gy):
        return DARK
    return TEAL


def render(size, ss=4):
    px = bytearray(size * size * 4)
    step = 1.0 / ss
    off = step / 2.0
    total = ss * ss
    for y in range(size):
        row = y * size * 4
        for x in range(size):
            r = g = b = 0
            hits = 0
            for sy in range(ss):
                fy = y + off + sy * step
                for sx in range(ss):
                    c = sample(x + off + sx * step, fy, size)
                    if c is not None:
                        r += c[0]; g += c[1]; b += c[2]
                        hits += 1
            i = row + x * 4
            if hits:
                # Un-premultiplied colour, so transparent corners don't darken.
                px[i]     = r // hits
                px[i + 1] = g // hits
                px[i + 2] = b // hits
                px[i + 3] = (hits * 255) // total
    return bytes(px)


def write_png(path, size, rgba):
    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    stride = size * 4
    raw = bytearray()
    for y in range(size):
        raw.append(0)                                    # filter: none
        raw += rgba[y * stride:(y + 1) * stride]

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
           + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)


if __name__ == "__main__":
    import sys
    outdir = sys.argv[1].rstrip("/")
    for size in (16, 32, 48, 128):
        # Small sizes need more samples per pixel to keep the notches readable.
        ss = 8 if size <= 48 else 4
        write_png(f"{outdir}/icon{size}.png", size, render(size, ss))
        print(f"wrote {outdir}/icon{size}.png")
