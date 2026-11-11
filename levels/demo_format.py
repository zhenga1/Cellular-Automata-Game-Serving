"""Read/write the sim's .demo world files.

Format (text):
  line 1: chunk count N
  then N pairs of lines:
    "cx cy cz"            chunk coords (a chunk is 32x32x32 cells)
    65536 ints            per cell: colour (0xAABBGGRR) then material id,
                          cell index i = z*1024 + y*32 + x  (local 0..31)
World cell (X,Y,Z) is in chunk (X>>5, Y>>5, Z>>5) at local (X&31, Y&31, Z&31).
"""
import gzip, io

EMPTY = 1
STONE, SAND, WATER, FIRE, SNOW, GRASS, WOOD, SMOKE, LAVA, TURF = 0, 2, 3, 4, 5, 6, 8, 10, 11, 23
# Spawners, in the order of the CELLS macro in src/cell_types.h
WATER_SPAWNER, FIRE_SPAWNER, LAVA_SPAWNER = 13, 14, 20

COLOR = {
    STONE: (135, 140, 140), SAND: (238, 208, 162), WATER: (37, 125, 255),
    FIRE: (228, 45, 2), SNOW: (252, 252, 252), GRASS: (30, 130, 12),
    WOOD: (80, 60, 40), SMOKE: (70, 70, 70), LAVA: (236, 120, 24), TURF: (70, 150, 60),
    FIRE_SPAWNER: (165, 70, 228), WATER_SPAWNER: (165, 70, 228), LAVA_SPAWNER: (165, 70, 228),
}

def pack(rgb):
    r, g, b = rgb
    return (255 << 24) | (b << 16) | (g << 8) | r

def unpack(c):
    return (c & 255, (c >> 8) & 255, (c >> 16) & 255)

class World:
    def __init__(self):
        self.chunks = {}

    @classmethod
    def load(cls, path):
        raw = gzip.open(path, 'rt') if path.endswith('.gz') else open(path, 'rt')
        with raw as f:
            n = int(f.readline())
            w = cls()
            for _ in range(n):
                c = tuple(int(v) for v in f.readline().split())
                w.chunks[c] = [int(v) for v in f.readline().split()]
        return w

    def save(self, path):
        out = io.StringIO()
        nl = chr(10)
        out.write(str(len(self.chunks)) + nl)
        for c, d in self.chunks.items():
            out.write('%d %d %d' % c + nl)
            out.write(''.join('%d ' % v for v in d) + nl)
        data = out.getvalue().encode()
        if path.endswith('.gz'):
            with gzip.GzipFile(path, 'wb', mtime=0) as f:
                f.write(data)
        else:
            open(path, 'wb').write(data)

    def _slot(self, x, y, z, make=False):
        key = (x >> 5, y >> 5, z >> 5)
        d = self.chunks.get(key)
        if d is None:
            if not make:
                return None, 0
            d = [0, EMPTY] * 32768
            self.chunks[key] = d
        return d, ((z & 31) * 1024 + (y & 31) * 32 + (x & 31)) * 2

    def get(self, x, y, z):
        d, i = self._slot(x, y, z)
        return EMPTY if d is None else d[i + 1]

    def color(self, x, y, z):
        d, i = self._slot(x, y, z)
        return 0 if d is None else d[i]

    def set(self, x, y, z, mat, rgb=None):
        d, i = self._slot(x, y, z, make=True)
        if mat == EMPTY:
            d[i], d[i + 1] = 0, EMPTY
        else:
            d[i] = pack(rgb if rgb else COLOR[mat])
            d[i + 1] = mat

    def fill(self, x0, x1, y0, y1, z0, z1, mat, rgb=None):
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                for z in range(z0, z1 + 1):
                    self.set(x, y, z, mat, rgb)

    def bounds(self):
        xs = [c[0] for c in self.chunks]; ys = [c[1] for c in self.chunks]; zs = [c[2] for c in self.chunks]
        return (min(xs) * 32, max(xs) * 32 + 31, min(ys) * 32, max(ys) * 32 + 31,
                min(zs) * 32, max(zs) * 32 + 31)

    def counts(self):
        from collections import Counter
        n = Counter()
        for d in self.chunks.values():
            for j in range(1, 65536, 2):
                n[d[j]] += 1
        return n
