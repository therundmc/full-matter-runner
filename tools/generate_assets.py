#!/usr/bin/env python3
"""Deterministic pixel-art sprite generator for FullMatterRunner.

Paints every sprite of the registry (tools/sprites/registry.py: the SPRITES of each kit of tools/sprites/) into
assets/sprites/<group>/<name>.png (RGBA, written only where the pixels changed), deletes what no kit paints any more,
and writes what is generated from the registry: src/engine/spritelist.js (what the game loads, at which density) and
tools/sprite_tables.py (what the level builder knows of the props). Never edit those two by hand.

Run from the repo root:
    python tools/generate_assets.py                   paint every kit
    python tools/generate_assets.py --only road,deco  paint these kits only (the others' files are left as they are)
    python tools/generate_assets.py --check           paint and compare with what is on disk, write nothing: exit 1
                                                      when anything differs
    -j N                                              worker processes (default: one a core; 1: this process alone)
    --out DIR                                         paint into DIR instead of assets/sprites
Every painter seeds its own random.Random: the output is the same whatever paints it, in whatever order.
"""
import argparse
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from functools import partial

from pngout import prune, same_pixels, save_png
from sprites import registry

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, 'assets', 'sprites')
LISTS = {os.path.join(ROOT, 'src', 'engine', 'spritelist.js'): registry.spritelist_js,
         os.path.join(ROOT, 'tools', 'sprite_tables.py'): registry.sprite_tables_py}


def paint_job(paths, kits, out_dir, check):
    """Paint the sprites `paths` (one batch, or one sprite) and write or compare them: [(file, changed)]."""
    reg = registry.sprites(kits)
    done = []
    for p in paths:
        for path, cv in registry.paint(reg[p]):
            f = os.path.join(out_dir, path + '.png')
            if check:
                done.append((path, not same_pixels(cv.img, f)))
            else:
                os.makedirs(os.path.dirname(f), exist_ok=True)
                done.append((path, save_png(cv.img, f)))
    return done


def jobs(reg):
    """The sprites grouped by what is painted in one call, the biggest first (the pool's last job is a short one)."""
    by = {}
    for sp in reg.values():
        by.setdefault(registry.batch_of(sp), []).append(sp)
    work = [(sum(sp.png[0] * sp.png[1] for sp in sps), [sp.path for sp in sps]) for sps in by.values()]
    return [paths for _, paths in sorted(work, key=lambda w: -w[0])]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--only', help='kits to paint, comma-separated (tools/sprites/registry.py KITS)')
    ap.add_argument('--check', action='store_true', help='compare with the files on disk, write nothing')
    ap.add_argument('-j', type=int, default=os.cpu_count() or 1, help='worker processes')
    ap.add_argument('--out', default=OUT_DIR, help='the sprites folder (default: assets/sprites)')
    a = ap.parse_args()
    t0 = time.time()
    kits = registry.KITS
    if a.only:
        kits = tuple(a.only.split(','))
        unknown = set(kits) - set(registry.KITS)
        assert not unknown, 'unknown kits %s (registry.KITS: %s)' % (sorted(unknown), ', '.join(registry.KITS))
    reg = registry.sprites(kits)
    work = jobs(reg)
    job = partial(paint_job, kits=kits, out_dir=a.out, check=a.check)
    if a.j > 1:
        with ProcessPoolExecutor(a.j) as pool:
            done = [r for rs in pool.map(job, work) for r in rs]
    else:
        done = [r for paths in work for r in job(paths)]
    changed = sorted(p for p, c in done if c)
    painted = len(changed)
    # what no kit paints any more goes (the registry's groups only: comic/ and title/ are tools/comic's)
    everything = registry.sprites()
    names = {}
    for sp in everything.values():
        for f in sp.files:
            g, n = f.split('/')
            names.setdefault(g, set()).add(n)
    stale = []
    for g in sorted(names):
        d = os.path.join(a.out, g)
        if not os.path.isdir(d):
            continue
        if a.check:
            stale += ['%s/%s' % (g, f[:-4]) for f in sorted(os.listdir(d)) if f.endswith('.png') and f[:-4] not in names[g]]
        else:
            stale += ['%s/%s' % (g, n) for n in prune(d, names[g])]
    # the lists made from the whole registry
    for f, make in LISTS.items():
        text = make(everything)
        old = open(f).read() if os.path.isfile(f) else None
        if text != old:
            changed.append(os.path.relpath(f, ROOT))
            if not a.check:
                with open(f, 'w') as out:
                    out.write(text)
    dt = time.time() - t0
    if a.check:
        for p in changed:
            print('differs: %s' % p)
        for p in stale:
            print('stale: %s' % p)
        print('checked %d sprites in %.1fs: %s' % (len(done), dt, 'all identical' if not (changed or stale) else
                                                   '%d differ, %d stale' % (len(changed), len(stale))))
        return 1 if changed or stale else 0
    for p in stale:
        print('deleted stale %s.png' % p)
    for p in changed[painted:]:
        print('wrote %s' % p)
    print('generated %d sprites into %s in %.1fs (%d written, the others unchanged)' % (len(done), a.out, dt, painted))
    return 0


if __name__ == '__main__':
    sys.exit(main())
