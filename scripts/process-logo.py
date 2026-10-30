#!/usr/bin/env python3
import math
import os
import sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGO_PATH = os.path.join(ROOT, "logo.png")

def make_icon(im, size, radius_ratio=0.20):
    scale = 3 if size <= 48 else 2
    target_size = size * scale
    resized = im.resize((target_size, target_size), Image.Resampling.LANCZOS).convert("RGBA")
    
    mask = Image.new("L", (target_size, target_size), 0)
    draw = ImageDraw.Draw(mask)
    r = int(radius_ratio * target_size)
    draw.rounded_rectangle([(0, 0), (target_size - 1, target_size - 1)], radius=r, fill=255)
    
    resized.putalpha(mask)
    return resized.resize((size, size), Image.Resampling.LANCZOS)

def draw_gradient(w, h, top_color, bot_color):
    img = Image.new("RGB", (w, h))
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(top_color[0] + (bot_color[0] - top_color[0]) * t)
        g = int(top_color[1] + (bot_color[1] - top_color[1]) * t)
        b = int(top_color[2] + (bot_color[2] - top_color[2]) * t)
        for x in range(w):
            img.putpixel((x, y), (r, g, b))
    return img

def render_small_promo(logo_img):
    W, H = 440, 280
    base = draw_gradient(W, H, (14, 27, 54), (7, 13, 26))
    
    # Top accent line
    for x in range(W):
        t = math.sin((x / W) * math.pi)
        r = int(37 + (56 - 37) * t)
        g = int(99 + (189 - 99) * t)
        b = int(235 + (248 - 235) * t)
        for y in range(2):
            base.putpixel((x, y), (r, g, b))
        
    icon_size = 148
    icon = make_icon(logo_img, icon_size, radius_ratio=0.20)
    
    # Drop shadow
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    icon_x = 32
    icon_y = (H - icon_size) // 2
    s_draw.rounded_rectangle(
        [(icon_x - 2, icon_y + 4), (icon_x + icon_size + 2, icon_y + icon_size + 8)],
        radius=int(0.20 * icon_size),
        fill=(0, 0, 0, 150)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(8))
    
    base = Image.alpha_composite(base.convert("RGBA"), shadow)
    base.paste(icon, (icon_x, icon_y), icon)
    
    font_bold_title = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 30)
    font_bold_sub = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 13)
    font_regular = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 12)
    font_pill = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 11)
    
    draw = ImageDraw.Draw(base)
    text_x = 206
    
    draw.text((text_x, 68), "Leetcomete", fill=(255, 255, 255), font=font_bold_title)
    draw.text((text_x, 112), "Local Code Completion", fill=(56, 189, 248), font=font_bold_sub)
    draw.text((text_x, 132), "for Competitive Programming", fill=(186, 230, 253), font=font_regular)
    
    pills = ["Private & Offline", "15 Languages"]
    px = text_x
    py = 170
    for pill in pills:
        bbox = font_pill.getbbox(pill)
        pw = bbox[2] - bbox[0] + 16
        ph = 24
        draw.rounded_rectangle([(px, py), (px + pw, py + ph)], radius=12, fill=(15, 33, 64), outline=(37, 99, 235), width=1)
        draw.text((px + 8, py + 5), pill, fill=(224, 242, 254), font=font_pill)
        px += pw + 8
        
    return base.convert("RGB")

def render_small_promo_fitted(logo_img):
    W, H = 440, 280
    base = draw_gradient(W, H, (14, 27, 54), (7, 13, 26))
    
    # Scale logo to fit inside 250x250 with padding
    fitted_size = 240
    icon = make_icon(logo_img, fitted_size, radius_ratio=0.18)
    
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    ix = (W - fitted_size) // 2
    iy = (H - fitted_size) // 2
    s_draw.rounded_rectangle([(ix - 4, iy + 6), (ix + fitted_size + 4, iy + fitted_size + 10)], radius=int(0.18 * fitted_size), fill=(0, 0, 0, 160))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    
    base = Image.alpha_composite(base.convert("RGBA"), shadow)
    base.paste(icon, (ix, iy), icon)
    return base.convert("RGB")

def render_marquee_promo(logo_img):
    W, H = 1400, 560
    base = draw_gradient(W, H, (14, 27, 54), (6, 11, 22))
    
    for x in range(W):
        t = math.sin((x / W) * math.pi)
        r = int(37 + (56 - 37) * t)
        g = int(99 + (189 - 99) * t)
        b = int(235 + (248 - 235) * t)
        for y in range(4):
            base.putpixel((x, y), (r, g, b))
            
    icon_size = 360
    icon = make_icon(logo_img, icon_size, radius_ratio=0.20)
    
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    icon_x = 90
    icon_y = (H - icon_size) // 2
    
    s_draw.ellipse(
        [(icon_x - 35, icon_y - 35), (icon_x + icon_size + 35, icon_y + icon_size + 35)],
        fill=(56, 189, 248, 50)
    )
    s_draw.rounded_rectangle(
        [(icon_x - 6, icon_y + 10), (icon_x + icon_size + 6, icon_y + icon_size + 20)],
        radius=int(0.20 * icon_size),
        fill=(0, 0, 0, 160)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    
    base = Image.alpha_composite(base.convert("RGBA"), shadow)
    base.paste(icon, (icon_x, icon_y), icon)
    
    font_hero = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 72)
    font_sub = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 28)
    font_desc = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 22)
    font_pill = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 16)
    
    draw = ImageDraw.Draw(base)
    text_x = 510
    
    draw.text((text_x, 115), "Leetcomete", fill=(255, 255, 255), font=font_hero)
    draw.text((text_x, 215), "Intelligent Autocomplete for Coding Practice", fill=(56, 189, 248), font=font_sub)
    draw.text((text_x, 260), "Fast, local-first code suggestions directly inside browser editors.", fill=(186, 230, 253), font=font_desc)
    
    pills = [
        "100% Local & Private",
        "15 Programming Languages",
        "Monaco & CodeMirror Support"
    ]
    px = text_x
    py = 330
    for pill in pills:
        bbox = font_pill.getbbox(pill)
        pw = bbox[2] - bbox[0] + 24
        ph = 40
        draw.rounded_rectangle([(px, py), (px + pw, py + ph)], radius=20, fill=(15, 33, 64), outline=(37, 99, 235), width=2)
        draw.text((px + 12, py + 10), pill, fill=(224, 242, 254), font=font_pill)
        px += pw + 16
        
    return base.convert("RGB")

def render_marquee_promo_fitted(logo_img):
    W, H = 1400, 560
    base = draw_gradient(W, H, (14, 27, 54), (6, 11, 22))
    
    fitted_size = 500
    icon = make_icon(logo_img, fitted_size, radius_ratio=0.18)
    
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow)
    ix = (W - fitted_size) // 2
    iy = (H - fitted_size) // 2
    s_draw.rounded_rectangle([(ix - 8, iy + 10), (ix + fitted_size + 8, iy + fitted_size + 20)], radius=int(0.18 * fitted_size), fill=(0, 0, 0, 170))
    shadow = shadow.filter(ImageFilter.GaussianBlur(16))
    
    base = Image.alpha_composite(base.convert("RGBA"), shadow)
    base.paste(icon, (ix, iy), icon)
    return base.convert("RGB")

def main():
    if not os.path.exists(LOGO_PATH):
        print(f"Error: {LOGO_PATH} not found", file=sys.stderr)
        sys.exit(1)
        
    im = Image.open(LOGO_PATH)
    print(f"Loaded logo.png: {im.size}, {im.mode}")
    
    # 1. Generate Extension Icons (16, 32, 48, 128)
    src_icons_dir = os.path.join(ROOT, "src", "icons")
    os.makedirs(src_icons_dir, exist_ok=True)
    
    for size in [16, 32, 48, 128]:
        icon = make_icon(im, size)
        out_path = os.path.join(src_icons_dir, f"icon{size}.png")
        icon.save(out_path, format="PNG")
        print(f"Wrote {out_path} ({size}x{size})")
        
    # Also save brand-mark for UI
    ui_brand_mark = make_icon(im, 128, radius_ratio=0.22)
    ui_brand_mark.save(os.path.join(ROOT, "src", "ui", "brand-mark.png"), format="PNG")
    print("Wrote src/ui/brand-mark.png (128x128)")
    
    # 2. Generate Developer Settings / Store Assets in images/
    images_dir = os.path.join(ROOT, "images")
    os.makedirs(images_dir, exist_ok=True)
    
    # Store Icon 128x128 (with rounded transparent corners)
    store_icon = make_icon(im, 128, radius_ratio=0.20)
    store_icon.save(os.path.join(images_dir, "icon128.png"), format="PNG")
    print("Wrote images/icon128.png (128x128 Store Icon)")
    
    # Raw Square Store Icon 128x128
    store_icon_square = im.resize((128, 128), Image.Resampling.LANCZOS)
    store_icon_square.save(os.path.join(images_dir, "icon128_square.png"), format="PNG")
    print("Wrote images/icon128_square.png (128x128 Square Icon)")
    
    # High-Res Master Icon 512x512
    icon512 = make_icon(im, 512, radius_ratio=0.20)
    icon512.save(os.path.join(images_dir, "icon512.png"), format="PNG")
    print("Wrote images/icon512.png (512x512 Master Icon)")
    
    # Small Promo Tile (440x280)
    small_promo = render_small_promo(im)
    small_promo.save(os.path.join(images_dir, "small_promo_440x280.png"), format="PNG")
    print("Wrote images/small_promo_440x280.png (440x280 Small Promo Tile)")
    
    small_promo_fitted = render_small_promo_fitted(im)
    small_promo_fitted.save(os.path.join(images_dir, "small_promo_440x280_fitted.png"), format="PNG")
    print("Wrote images/small_promo_440x280_fitted.png (440x280 Fitted Tile)")
    
    # Marquee Promo Tile (1400x560)
    marquee_promo = render_marquee_promo(im)
    marquee_promo.save(os.path.join(images_dir, "marquee_promo_1400x560.png"), format="PNG")
    print("Wrote images/marquee_promo_1400x560.png (1400x560 Marquee Promo Tile)")
    
    marquee_promo_fitted = render_marquee_promo_fitted(im)
    marquee_promo_fitted.save(os.path.join(images_dir, "marquee_promo_1400x560_fitted.png"), format="PNG")
    print("Wrote images/marquee_promo_1400x560_fitted.png (1400x560 Fitted Tile)")

    # 3. Landing page icons
    site_dir = os.path.join(ROOT, "site")
    if os.path.exists(site_dir):
        make_icon(im, 48).save(os.path.join(site_dir, "icon48.png"), format="PNG")
        make_icon(im, 128).save(os.path.join(site_dir, "icon128.png"), format="PNG")
        print("Updated site/icon48.png and site/icon128.png")

if __name__ == "__main__":
    main()
