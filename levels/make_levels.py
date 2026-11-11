"""Build the Play mode levels: level*.demo.gz, levels.json and map thumbnails.

Run from this folder:  python make_levels.py
Everything it writes lands in this folder, which play.html reads.
"""
import hashlib, json, os, random, struct, zlib

from demo_format import (World, EMPTY, STONE, SAND, WATER, FIRE, SNOW, GRASS,
                         WOOD, TURF, pack, unpack)

W = H = 96          # the world is 96x96 cells across, y 0..31
TOP = 31

# Surface palette. Colours are stored per cell, so these are what the level
# actually looks like in the sim.
DIRT     = (104, 84, 62)
DIRT_TOP = (122, 100, 72)
ROCK     = (118, 120, 122)
LAWN     = (74, 152, 62)
DRY      = (152, 150, 74)
PLANK    = (122, 92, 58)
TRUNK    = (84, 62, 42)
LEAF     = (46, 112, 44)
WALL     = (96, 72, 48)
ROOF     = (150, 70, 50)
SKIN     = (226, 182, 142)
SHIRTS   = [(196, 62, 58), (62, 94, 196), (214, 178, 62), (146, 84, 174)]

VILLAGER_H = 4      # 2 x 2 footprint, 4 tall: 3 of body, 1 of head

# Fire only keeps going where it has plenty of fuel touching it: each burning
# block turns every burnable neighbour to fire with a 1-in-7 chance and to
# smoke otherwise, so a single sheet of grass burns out instead of spreading.
# The meadow is therefore deep dry grass, and the mown village lawn is shorter.
SOIL_TOP  = 2                   # top of the stone/soil base
MEADOW_TOP = SOIL_TOP + 4       # deep dry grass: y 3..6
LAWN_TOP   = SOIL_TOP + 3       # mown lawn, shorter but still burns: y 3..5
STAND = LAWN_TOP + 1            # village things stand here


def villager(w, x, z, shirt):
    """A little wooden figure standing on the lawn. Returns its cells."""
    cells = []
    for dx in (0, 1):
        for dz in (0, 1):
            for dy in range(VILLAGER_H):
                y = STAND + dy
                w.set(x + dx, y, z + dz, WOOD,
                      SKIN if dy == VILLAGER_H - 1 else shirt)
                cells.append([x + dx, y, z + dz])
    return cells


def hut(w, x, z):
    """A 5x5 wooden hut with a doorway and a peaked roof."""
    for dx in range(5):
        for dz in range(5):
            if dx in (0, 4) or dz in (0, 4):
                for dy in range(4):
                    w.set(x + dx, STAND + dy, z + dz, WOOD, WALL)
    for dy, inset in enumerate((0, 1, 2)):
        for dx in range(inset, 5 - inset):
            for dz in range(inset, 5 - inset):
                w.set(x + dx, STAND + 4 + dy, z + dz, WOOD, ROOF)
    for dy in range(2):
        w.set(x + 2, STAND + dy, z, EMPTY)


def tree(w, x, z, height):
    base = MEADOW_TOP + 1
    for y in range(base, base + height):
        w.set(x, y, z, WOOD, TRUNK)
    top = base + height
    for dx in (-1, 0, 1):
        for dz in (-1, 0, 1):
            for dy in (0, 1):
                if abs(dx) + abs(dz) + dy < 3:
                    w.set(x + dx, top - 1 + dy, z + dz, WOOD, LEAF)


def build_level1():
    w = World()
    # Touch every chunk of the 3x1x3 world so the sim always sizes the grid
    # the same way.
    for cx in range(3):
        for cz in range(3):
            w.set(cx * 32, 0, cz * 32, EMPTY)

    # Bedrock, soil, and the bare rock the ravine floor is made of.
    w.fill(0, W - 1, 0, 1, 0, H - 1, STONE, DIRT)
    w.fill(0, W - 1, 2, 2, 0, H - 1, STONE, DIRT_TOP)

    # The mown lawn the village stands on, and the deep dry meadow the fire
    # starts in.
    w.fill(2, W - 3, 3, LAWN_TOP, 2, 21, TURF, LAWN)
    w.fill(2, W - 3, 3, MEADOW_TOP, 35, H - 3, TURF, DRY)

    # The ravine between them. Nothing burnable crosses it.
    w.fill(0, W - 1, 1, MEADOW_TOP + 1, 22, 34, EMPTY)
    w.fill(0, W - 1, 0, 0, 22, 34, STONE, ROCK)

    # Route 1, the land bridge: dry grass running straight to the village.
    w.fill(30, 42, 0, 2, 22, 34, STONE, DIRT)
    w.fill(30, 42, 3, MEADOW_TOP, 22, 34, TURF, DRY)

    # Route 2, the footbridge: a solid wooden span with railings, running a few
    # cells into the grass at each end. It needs both the bulk and the overlap -
    # a thin span, or one that only just touches the grass, burns out halfway
    # instead of carrying the fire across.
    w.fill(8, 12, LAWN_TOP - 1, LAWN_TOP, 18, 38, WOOD, PLANK)
    for px in (8, 12):
        w.fill(px, px, LAWN_TOP + 1, LAWN_TOP + 2, 20, 36, WOOD, PLANK)
    for pz in (22, 28, 34):
        for px in (8, 12):
            w.fill(px, px, 1, LAWN_TOP - 2, pz, pz, WOOD, TRUNK)

    # The village pond: a water supply, and a place the fire cannot cross.
    w.fill(62, 74, 1, LAWN_TOP, 4, 12, EMPTY)
    w.fill(62, 74, 1, LAWN_TOP, 4, 12, WATER)

    hut(w, 24, 6)
    hut(w, 44, 4)
    hut(w, 52, 14)
    where = [('by the pond', 58, 16), ('on the lawn', 36, 12),
             ('near the huts', 30, 17), ('at the footbridge', 14, 15)]
    villagers = [{'name': name,
                  'color': 'rgb(%d,%d,%d)' % SHIRTS[i],
                  'cells': villager(w, x, z, SHIRTS[i])}
                 for i, (name, x, z) in enumerate(where)]

    # Meadow trees, so the fire has something to climb.
    rng = random.Random(1848)
    spots = []
    for _ in range(400):
        x, z = rng.randrange(6, W - 6), rng.randrange(38, H - 6)
        if all(abs(x - a) + abs(z - b) > 9 for a, b in spots):
            spots.append((x, z))
            tree(w, x, z, rng.randrange(4, 7))
        if len(spots) == 16:
            break

    # The wildfire, already burning across the middle of the meadow.
    w.fill(4, W - 5, 3, MEADOW_TOP, 56, 64, FIRE)
    return w, villagers


LEVELS = [{
    'id': 'level1',
    'name': 'Save the Villagers',
    'subtitle': 'Level 1 - Firebreak',
    'brief': 'A wildfire is sweeping down the dry meadow towards the village. '
             'The four villagers cannot move, and everything they are made of burns.',
    'goal': 'Keep all four villagers alive until the fire burns itself out.',
    'hints': [
        'Fire spreads to every burnable block touching it, diagonals included, '
        'so a gap in the fuel stops it. Stone never burns.',
        'Only two things cross the ravine: the grass land bridge and the wooden '
        'footbridge. Everything else is bare rock.',
        'Water turns fire into steam on contact, and a water spawner keeps '
        'pouring, so one placed uphill floods a whole strip.',
        'You can delete the footbridge instead of defending it.',
    ],
    'materials': ['stone', 'sand', 'water', 'snow', 'delete'],
    'placements': 20,
    'max_brush': 5,
    'camera': {'eye': [-20, 80, -64], 'look': [50, 2, 48]},
    'build': build_level1,
}]


def png(path, pixels, width, height):
    """Write an 8-bit RGB PNG. pixels is a flat list of (r, g, b)."""
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            raw.extend(pixels[y * width + x])

    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body))

    out = bytes([137, 80, 78, 71, 13, 10, 26, 10])
    out += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
    out += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    out += chunk(b'IEND', b'')
    open(path, 'wb').write(out)


def map_thumb(w, path, scale=4):
    """Top-down map of a level: the colour of the highest block in each column."""
    SKY = (24, 26, 32)
    px = []
    for z in range(H - 1, -1, -1):      # the village (z = 0) ends up at the bottom
        row = []
        for x in range(W):
            col = SKY
            for y in range(TOP, -1, -1):
                if w.get(x, y, z) != EMPTY:
                    r, g, b = unpack(w.color(x, y, z))
                    shade = max(0.62, 1.0 - 0.014 * (TOP - y))
                    col = tuple(min(255, int(c * shade)) for c in (r, g, b))
                    break
            row.append(col)
        for _ in range(scale):
            px.extend(c for c in row for _ in range(scale))
    png(path, px, W * scale, H * scale)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    out = []
    for spec in LEVELS:
        w, villagers = spec['build']()
        w.save(os.path.join(here, spec['id'] + '.demo.gz'))
        map_thumb(w, os.path.join(here, spec['id'] + '.png'))
        entry = {k: v for k, v in spec.items() if k != 'build'}
        entry['file'] = spec['id'] + '.demo.gz'
        entry['thumb'] = spec['id'] + '.png'
        # play.html asks for the world file with ?v=<hash>, so regenerating a
        # level never leaves a browser holding the old one. The site's build id
        # cannot do that job: levels are built separately from the sim.
        entry['hash'] = hashlib.sha256(
            open(os.path.join(here, entry['file']), 'rb').read()).hexdigest()[:12]
        entry['villagers'] = villagers
        out.append(entry)
        n = w.counts()
        print('%s: %d chunks, turf %d, wood %d, fire %d, water %d, villager cells %d'
              % (spec['id'], len(w.chunks), n[TURF], n[WOOD], n[FIRE], n[WATER],
                 sum(len(v['cells']) for v in villagers)))
    with open(os.path.join(here, 'levels.json'), 'w') as f:
        json.dump({'levels': out}, f, indent=1)
        f.write(chr(10))


if __name__ == '__main__':
    main()
