from collections import deque
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "sm-techno-icon-source.jpg"
OUTPUT_ICO = ROOT / "assets" / "sm-techno-icon.ico"
OUTPUT_PNG = ROOT / "assets" / "sm-techno-icon-preview.png"

def remove_outer_background(source: Image.Image) -> Image.Image:
    image = source.convert("RGBA")
    width, height = image.size
    pixels = image.load()

    visited = set()
    queue = deque()
    threshold = 36

    seeds = [
        (0, 0),
        (width - 1, 0),
        (0, height - 1),
        (width - 1, height - 1),
    ]

    for seed in seeds:
        queue.append(seed)
        visited.add(seed)

    while queue:
        x, y = queue.popleft()
        r, g, b, a = pixels[x, y]
        if r > threshold or g > threshold or b > threshold:
            continue

        pixels[x, y] = (r, g, b, 0)

        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in visited:
                visited.add((nx, ny))
                queue.append((nx, ny))

    bbox = image.getbbox()
    if bbox:
        image = image.crop(bbox)

    return image


def build_icon() -> None:
    source = Image.open(SOURCE)
    emblem = remove_outer_background(source)
    emblem = emblem.crop((10, 0, emblem.width - 18, emblem.height))

    canvas_size = 1024
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))

    target_width = 992
    scale = target_width / emblem.width
    emblem = emblem.resize((target_width, int(emblem.height * scale)), Image.LANCZOS)

    position = (
        (canvas_size - emblem.width) // 2,
        (canvas_size - emblem.height) // 2,
    )
    canvas.alpha_composite(emblem, position)

    preview = canvas.resize((512, 512), Image.LANCZOS)
    preview.save(OUTPUT_PNG)

    sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    preview.save(OUTPUT_ICO, sizes=sizes)


if __name__ == "__main__":
    build_icon()
