# 抓取五套场景背景图（pollinations.ai 生图，flux 模型），裁掉右下角水印、压成小 JPEG。
# 用法：python spike/fetch-bg.py   （产物 demo/bg/*.jpg；种子固定，可复现）
import io, os, time, urllib.parse, urllib.request

BG_DIR = os.path.join("demo", "bg")
W, H = 1280, 800

SCENES = {
    # id: (prompt, seed)。空白场景没有照片（纯程序化渐变），不在此列。
    "lab": ("bright modern laboratory workbench, clean white bench top occupying the lower third, "
            "blurred glass beakers and flasks on the far side of the bench, soft cool daylight, "
            "shallow depth of field, photorealistic, no text, no watermark", 7),
    "nature": ("flat weathered rock slab in the lower third of the frame, blurred green forest "
               "and soft blue sky behind, warm morning sunlight, outdoor nature scene, "
               "photorealistic, no text, no watermark", 11),
    "cabinet": ("dark wooden museum display cabinet interior, glass shelf lit by a single warm "
                "spotlight from above, deep shadows, empty centre of shelf, shallow depth of field, "
                "photorealistic, no text, no watermark", 5),
    "paper": ("blank ivory sketchbook paper filling the frame, soft window light from the left, "
              "subtle paper grain, faint pencil margin line, bright clean minimal, "
              "photorealistic, no text, no watermark", 3),
}

def fetch(scene, prompt, seed):
    # flux 质量更好但免费档限流（402/429），失败就等一等重试，最后退回默认模型
    for attempt, model in enumerate(["flux", "flux", "flux", ""]):
        url = ("https://image.pollinations.ai/prompt/" + urllib.parse.quote(prompt)
               + f"?width={W}&height={H}&seed={seed}&nologo=true")
        if model:
            url += "&model=" + model
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return r.read()
        except Exception as e:
            print(f"  {scene} attempt {attempt+1} ({model or 'default'}) failed: {e}")
            time.sleep(25)
    raise RuntimeError(f"{scene}: all attempts failed")

def main():
    os.makedirs(BG_DIR, exist_ok=True)
    from PIL import Image
    for sid, (prompt, seed) in SCENES.items():
        out = os.path.join(BG_DIR, sid + ".jpg")
        if os.path.exists(out) and os.path.getsize(out) > 40000:
            print(f"skip {sid} (exists)"); continue
        t0 = time.time()
        data = fetch(sid, prompt, seed)
        im = Image.open(io.BytesIO(data)).convert("RGB")
        # 裁掉底部 9%（pollinations 免费档右下角有水印）再裁成 16:10
        w, h = im.size
        im = im.crop((0, 0, w, int(h * 0.91)))
        im = im.resize((1280, 720), Image.LANCZOS)
        im.save(out, "JPEG", quality=72, optimize=True, progressive=True)
        kb = os.path.getsize(out) / 1024
        print(f"{sid}: {im.size} {kb:.0f} KB  ({time.time()-t0:.0f}s)")

if __name__ == "__main__":
    main()
