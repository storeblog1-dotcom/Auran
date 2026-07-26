import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# 1080x2400 Full Bleed Mobile Display Ratio
width, height = 1080, 2400
img = Image.new("RGBA", (width, height), (8, 9, 14, 255))
draw = ImageDraw.Draw(img)

# Try loading fonts
try:
    font_large = ImageFont.truetype("arialbd.ttf", 100)
    font_medium = ImageFont.truetype("arialbd.ttf", 54)
    font_small = ImageFont.truetype("arial.ttf", 32)
    font_badge = ImageFont.truetype("arialbd.ttf", 28)
except:
    font_large = ImageFont.load_default()
    font_medium = ImageFont.load_default()
    font_small = ImageFont.load_default()
    font_badge = ImageFont.load_default()

# 1. Background Ambient Glow Effects
glow_bg = Image.new("RGBA", (width, height), (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow_bg)

# Top Left Purple Glow
glow_draw.ellipse((width//2 - 400, 700, width//2 + 400, 1500), fill=(139, 92, 246, 75))
# Bottom Right Cyan Glow
glow_draw.ellipse((width//2 - 350, 850, width//2 + 350, 1550), fill=(6, 182, 212, 65))
blurred_bg = glow_bg.filter(ImageFilter.GaussianBlur(100))
img.paste(blurred_bg, (0, 0), blurred_bg)

# 2. TOP HEADER (y ~ 140)
header_y = 140

# Left A+ Badge
badge_x, badge_y = 60, header_y
draw.ellipse((badge_x, badge_y, badge_x + 64, badge_y + 64), outline=(255, 255, 255, 120), width=3)
draw.text((badge_x + 13, badge_y + 12), "A+", font=font_badge, fill=(255, 255, 255, 240))

# Right PREMIUM WELLNESS Badge
pill_w, pill_h = 320, 56
pill_x = width - 60 - pill_w
pill_y = header_y + 4
draw.rounded_rectangle((pill_x, pill_y, pill_x + pill_w, pill_y + pill_h), radius=28, fill=(139, 92, 246, 40), outline=(168, 85, 247, 100), width=2)
draw.text((pill_x + 32, pill_y + 11), "✦ PREMIUM WELLNESS", font=font_badge, fill=(192, 132, 252, 255))

# Top Title 'Aura+n'
# Render Aura+n text in top header center
top_title = "Aura+n"
bbox = font_medium.getbbox(top_title)
tw = bbox[2] - bbox[0]
draw.text(((width - tw) // 2, header_y + 2), top_title, font=font_medium, fill=(255, 255, 255, 255))


# 3. CENTER 3D EMBLEM & HALO RING (y ~ 650 to 1450)
ring_cx, ring_cy = width // 2, 1050
ring_r = 310

# Halo Ring Layers (Purple -> Pink -> Cyan Gradient Rings)
ring_img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
ring_draw = ImageDraw.Draw(ring_img)

for r in range(ring_r - 20, ring_r + 20, 2):
    alpha = int(220 * (1 - abs(r - ring_r) / 20))
    ring_draw.ellipse((ring_cx - r, ring_cy - r, ring_cx + r, ring_cy + r), outline=(139, 92, 246, alpha), width=4)
    ring_draw.ellipse((ring_cx - r + 6, ring_cy - r + 6, ring_cx + r - 6, ring_cy + r - 6), outline=(236, 72, 153, alpha), width=3)
    ring_draw.ellipse((ring_cx - r + 12, ring_cy - r + 12, ring_cx + r - 12, ring_cy + r - 12), outline=(6, 182, 212, alpha), width=3)

blurred_ring = ring_img.filter(ImageFilter.GaussianBlur(18))
img.paste(blurred_ring, (0, 0), blurred_ring)
img.paste(ring_img, (0, 0), ring_img)

# Center 3D A+ Glass Emblem Text
emblem_text = "A+"
try:
    font_emblem = ImageFont.truetype("arialbd.ttf", 240)
except:
    font_emblem = font_large

bbox_e = font_emblem.getbbox(emblem_text)
ew = bbox_e[2] - bbox_e[0]
eh = bbox_e[3] - bbox_e[1]

# Glow behind A+
draw.text((ring_cx - ew//2, ring_cy - eh//2 - 20), emblem_text, font=font_emblem, fill=(255, 255, 255, 255))


# 4. MAIN TITLE & TAGLINE (y ~ 1520)
main_title = "Aura+n"
bbox_m = font_large.getbbox(main_title)
mw = bbox_m[2] - bbox_m[0]

# Render neon gradient text for main title
draw.text(((width - mw) // 2, 1520), main_title, font=font_large, fill=(255, 255, 255, 255))

tagline = "Nurture. Evolve. Glow."
bbox_t = font_small.getbbox(tagline)
tw2 = bbox_t[2] - bbox_t[0]
draw.text(((width - tw2) // 2, 1660), tagline, font=font_small, fill=(161, 161, 170, 255))


# 5. BOTTOM FOOTER (y ~ 2200)
footer_y = 2220

# Bottom Pill
bpill_w, bpill_h = 300, 52
bpill_x = (width - bpill_w) // 2
draw.rounded_rectangle((bpill_x, footer_y, bpill_x + bpill_w, footer_y + bpill_h), radius=26, fill=(255, 255, 255, 15), outline=(255, 255, 255, 30), width=1)
draw.text((bpill_x + 36, footer_y + 11), "PREMIUM WELLNESS", font=font_badge, fill=(148, 163, 184, 255))

# Footer Note Right
footer_note = "Aura+n: Modern Sans-Serif"
bbox_fn = font_small.getbbox(footer_note)
fnw = bbox_fn[2] - bbox_fn[0]
draw.text((width - 60 - fnw, footer_y + 10), footer_note, font=font_small, fill=(100, 116, 139, 255))

# Bottom Left Star Sparkle Icon
draw.text((60, footer_y + 2), "✦", font=font_medium, fill=(139, 92, 246, 200))


# Save 1080x2400 PNG Asset
out_path = os.path.join(os.path.dirname(__file__), "splash.png")
img.save(out_path, "PNG")
print(f"Successfully generated 1080x2400 full bleed mobile splash PNG at: {out_path}")
