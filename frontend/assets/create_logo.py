import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

# Create transparent image
width, height = 800, 220
img = Image.new("RGBA", (width, height), (0, 0, 0, 0))

# Try loading sans-serif font
font_size = 110
try:
    font = ImageFont.truetype("arialbd.ttf", font_size)
except:
    try:
        font = ImageFont.truetype("arial.ttf", font_size)
    except:
        font = ImageFont.load_default()

# Text parts and colors
parts = [
    ("Au", (255, 255, 255), (139, 92, 246)),   # White text, Violet glow
    ("ra", (248, 250, 252), (236, 72, 153)),   # Pinkish-white text, Magenta glow
    ("+n", (224, 242, 254), (6, 182, 212)),    # Cyan text, Neon Cyan glow
]

# Calculate layout and positions
total_width = 0
part_widths = []
for text, _, _ in parts:
    bbox = font.getbbox(text)
    w = bbox[2] - bbox[0]
    part_widths.append(w)
    total_width += w

start_x = (width - total_width) // 2
start_y = (height - font_size) // 2 - 10

# Create Glow Layer
glow_img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow_img)

current_x = start_x
for i, (text, _, glow_color) in enumerate(parts):
    # Draw expanded text for glow
    for dx in range(-8, 9, 2):
        for dy in range(-8, 9, 2):
            glow_draw.text((current_x + dx, start_y + dy), text, font=font, fill=(*glow_color, 180))
    current_x += part_widths[i]

# Blur the glow layer heavily
blurred_glow = glow_img.filter(ImageFilter.GaussianBlur(14))
glow_img_2 = glow_img.filter(ImageFilter.GaussianBlur(6))

# Combine glow layers onto base img
img.paste(blurred_glow, (0, 0), blurred_glow)
img.paste(glow_img_2, (0, 0), glow_img_2)

# Create crisp sharp text layer
text_draw = ImageDraw.Draw(img)
current_x = start_x
for i, (text, text_color, glow_color) in enumerate(parts):
    # Outer stroke for crisp separation
    for dx in range(-1, 2):
        for dy in range(-1, 2):
            text_draw.text((current_x + dx, start_y + dy), text, font=font, fill=(*glow_color, 220))
    text_draw.text((current_x, start_y), text, font=font, fill=(*text_color, 255))
    current_x += part_widths[i]

# Output path
output_path = os.path.join(os.path.dirname(__file__), "aura_n_logo.png")
img.save(output_path, "PNG")
print(f"Successfully created transparent neon logo image asset at: {output_path}")
