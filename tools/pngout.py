"""Writing the generators' PNGs (tools/generate_assets.py, the comic and title stills of tools/comic/).

save_png leaves a file whose pixels are already those untouched: another Pillow or zlib compresses the same image
to other bytes, and rewriting every sprite would show the whole folder changed in git for nothing. What is written
is written with fixed settings and no metadata. prune deletes the PNGs of a generator's own folder that it no
longer makes (a sprite renamed or dropped)."""
import os

from PIL import Image


def same_pixels(img, path):
    if not os.path.isfile(path):
        return False
    with Image.open(path) as old:
        return old.mode == img.mode and old.size == img.size and old.tobytes() == img.tobytes()


def save_png(img, path):
    """Write img to path unless the file there already holds the same pixels. True when it was written."""
    if same_pixels(img, path):
        return False
    img.save(path, format='PNG', optimize=False, compress_level=9)
    return True


def prune(folder, names):
    """Delete the <name>.png files of folder whose name is not in names. Returns the names deleted."""
    gone = sorted(n[:-4] for n in os.listdir(folder) if n.endswith('.png') and n[:-4] not in names)
    for n in gone:
        os.remove(os.path.join(folder, n + '.png'))
    return gone
