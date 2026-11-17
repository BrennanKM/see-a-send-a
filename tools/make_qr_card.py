#!/usr/bin/env python3
"""Make a printable QR card for joining See a Send a.

Usage: python3 tools/make_qr_card.py [CHAPTER-CODE]
Writes qr-card.png (card with code, phone/print size) and qr-only.png (just the QR).
The QR points at /join, which walks people through Add to Home Screen.
"""
import os, sys
import qrcode
from PIL import Image, ImageDraw, ImageFont

URL = "https://see-a-send-a.pages.dev/join"
CODE = sys.argv[1] if len(sys.argv) > 1 else ""
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "print")
os.makedirs(OUT, exist_ok=True)

BG, SURFACE, TEXT, MUTED, GOLD = "#0b0a10", "#16141d", "#f4f2f8", "#9c97ab", "#f2c14e"

def font(size, bold=True):
    for p in (["/System/Library/Fonts/Supplemental/Arial Black.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"] if bold
              else ["/System/Library/Fonts/Supplemental/Arial.ttf"]):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, border=2, box_size=24)
q.add_data(URL); q.make(fit=True)
qr = q.make_image(fill_color="black", back_color="white").convert("RGB")

# Gold target icon in the middle (H error correction leaves room for it).
icon = Image.open(os.path.join(os.path.dirname(OUT), "public", "icons", "icon-512.png")).convert("RGBA")
s = qr.size[0] // 5
icon = icon.resize((s, s), Image.LANCZOS)
pad = Image.new("RGB", (s + 24, s + 24), "white")
qr.paste(pad, ((qr.size[0] - pad.size[0]) // 2, (qr.size[1] - pad.size[1]) // 2))
qr.paste(icon, ((qr.size[0] - s) // 2, (qr.size[1] - s) // 2), icon)
qr.save(os.path.join(OUT, "qr-only.png"))

W, H = 1200, 1800
card = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(card)
def center(text, y, f, fill):
    w = d.textlength(text, font=f)
    d.text(((W - w) / 2, y), text, font=f, fill=fill)

center("DELTA SIGMA PI", 90, font(40), MUTED)
center("See a Send a.", 150, font(110), TEXT)
center("Scan to get the chapter's snipe app", 300, font(44, False), MUTED)

qs = 860
qr_r = qr.resize((qs, qs), Image.NEAREST)
x, y = (W - qs) // 2, 400
d.rounded_rectangle((x - 30, y - 30, x + qs + 30, y + qs + 30), radius=48, fill="white")
card.paste(qr_r, (x, y))

y = 1330
if CODE:
    d.rounded_rectangle((120, y, W - 120, y + 230), radius=40, fill=SURFACE)
    center("CHAPTER CODE", y + 34, font(36), MUTED)
    f = font(96)
    while d.textlength(CODE, font=f) > W - 320 and f.size > 40:
        f = font(f.size - 4)
    center(CODE, y + 92, f, GOLD)
else:
    center("Get the chapter code from a brother.", y + 80, font(48, False), TEXT)
center("see-a-send-a.pages.dev/join", 1650, font(40, False), MUTED)

card.save(os.path.join(OUT, "qr-card.png"))
print("wrote", os.path.join(OUT, "qr-card.png"), "and qr-only.png")
