"""Bake the launch-site land/water maps for the local terrain (src/scene/environment).

Source: Natural Earth 1:10m physical vectors (public domain, https://www.naturalearthdata.com):
land, lakes and river centre lines, around the illustrative pad at 28.5 N, 80.58 W on the Florida
Atlantic coast. The vectors are projected onto the pad's tangent plane (pad-local metres:
x east, z south, the same orthographic mapping the terrain mesh uses), then a smooth
displacement field (a few broad Gaussian handles, gradient < 0.4, so topology is kept) moves the
coast so that the local layout in src/world/site.ts holds: the ocean shoreline ~900 m east of
the pad running NNW-SSE, the landing zone ~450 m inland from the coast. Away from the pad the
field goes to zero, so at 40-50 km the coast matches the globe imagery exactly. Coastlines get
fractal detail (small on the Atlantic beach, larger on lagoon shores), and a few illustrative
features are added: a port channel through the barrier island, spoil islands in the lagoons,
two lakes on the St. Johns River.

Outputs (checked in):
  public/textures/site/coast_sdf.png   2048 x 2048 RGB, 50 m texels over +-51.2 km:
      R,G = signed distance to the coast (16 bit: (R*256+G)/2 - 16384 m, land positive),
      B   = regional road mask distance (unused, 255).
  public/textures/site/cover.png       1024 x 1024 RGB, 100 m texels:
      R = open ocean (1) vs lagoon/river/lake water (0), blurred so beaches can read it,
      G = marsh / wetland weight, B = developed (town) weight.
  src/scene/environment/generated/regionalMap.ts  regional roads (pad-local polylines) and
      map constants shared with the shaders.

Run: python3 tools/site/bake_site.py   (needs numpy, scipy, pillow, pyshp, shapely)
"""
import io
import json
import math
import pathlib
import tempfile
import urllib.request
import zipfile

import numpy as np
import shapefile  # pyshp
import shapely
from PIL import Image
from scipy import ndimage
from scipy.spatial import cKDTree
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box, shape
from shapely.geometry.polygon import orient
from shapely.ops import transform, unary_union

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT_TEX = ROOT / 'public/textures/site'
OUT_TS = ROOT / 'src/scene/environment/generated/regionalMap.ts'
CACHE = pathlib.Path(tempfile.gettempdir()) / 'kimble-natural-earth'

R_EARTH = 6371000.0
LAT0, LON0 = 28.5, -80.58
EXT = 51200.0  # half size of the baked square (m)
N_SDF = 2048
N_COVER = 1024
SDF_RANGE = 16384.0  # +- metres representable
SDF_STEP = 0.5  # metres per code

# Displacement handles (pad-local metres): centre x, z, displacement x, z, sigma x, z.
WARP = [
    (3300, 0, -2200, 0, 4000, 5500),  # bring the Atlantic shore to ~900 m east of the pad
    (1800, -7000, -1000, 0, 3500, 4000),  # keep the shore north of the pad running NNW
    (200, 9400, -280, -250, 2000, 2000),  # coast ~450 m from the landing zone
]


# ───────────────────────────── helpers ─────────────────────────────

def fetch(name):
    CACHE.mkdir(parents=True, exist_ok=True)
    z = CACHE / f'{name}.zip'
    if not z.exists():
        url = f'https://naturalearth.s3.amazonaws.com/10m_physical/{name}.zip'
        print('download', url)
        with urllib.request.urlopen(url) as r:
            z.write_bytes(r.read())
    d = CACHE / name
    if not d.exists():
        with zipfile.ZipFile(z) as f:
            f.extractall(d)
    return shapefile.Reader(str(d / f'{name}.shp'))


_lat0 = math.radians(LAT0)
_lon0 = math.radians(LON0)
E0 = np.array([-math.sin(_lon0), math.cos(_lon0), 0.0])
N0 = np.array([-math.sin(_lat0) * math.cos(_lon0), -math.sin(_lat0) * math.sin(_lon0), math.cos(_lat0)])


def to_local(lon, lat):
    """Lon/lat (deg) -> pad-local tangent-plane metres (x east, z south)."""
    lon = np.radians(np.asarray(lon, float))
    lat = np.radians(np.asarray(lat, float))
    p = np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], -1)
    return R_EARTH * (p @ E0), -R_EARTH * (p @ N0)


def warp(x, z):
    x = np.asarray(x, float)
    z = np.asarray(z, float)
    dx = np.zeros_like(x)
    dz = np.zeros_like(z)
    for cx, cz, vx, vz, sx, sz in WARP:
        w = np.exp(-(((x - cx) / sx) ** 2) / 2 - (((z - cz) / sz) ** 2) / 2)
        dx += vx * w
        dz += vz * w
    return x + dx, z + dz


def geo_to_site(g):
    g = transform(lambda x, y: to_local(x, y), g)
    g = shapely.segmentize(g, 100.0)
    return transform(lambda x, y: warp(x, y), g)


def hash2(ix, iz, seed):
    h = (ix.astype(np.int64) * 374761393 + iz.astype(np.int64) * 668265263 + seed * 2147483647) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    h = h ^ (h >> 16)
    return (h & 0xFFFFFF) / float(0xFFFFFF)


def vnoise(x, z, seed=0):
    ix = np.floor(x)
    iz = np.floor(z)
    fx = x - ix
    fz = z - iz
    ux = fx * fx * (3 - 2 * fx)
    uz = fz * fz * (3 - 2 * fz)
    a = hash2(ix, iz, seed)
    b = hash2(ix + 1, iz, seed)
    c = hash2(ix, iz + 1, seed)
    d = hash2(ix + 1, iz + 1, seed)
    return (a + (b - a) * ux) * (1 - uz) + (c + (d - c) * ux) * uz


def fbm(x, z, wavelength, octaves=4, seed=0):
    s = 0.0
    amp = 0.5
    norm = 0.0
    f = 1.0 / wavelength
    for o in range(octaves):
        s = s + amp * (vnoise(x * f, z * f, seed + o * 17) * 2 - 1)
        norm += amp
        amp *= 0.5
        f *= 2.03
    return s / norm


def polys_of(g):
    if g.is_empty:
        return []
    if g.geom_type == 'Polygon':
        return [g]
    if g.geom_type == 'MultiPolygon':
        return list(g.geoms)
    return [p for p in getattr(g, 'geoms', []) if p.geom_type == 'Polygon']


def ellipse(cx, cz, rx, rz, rot=0.0, n=48):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    c, s = math.cos(rot), math.sin(rot)
    x = rx * np.cos(t)
    z = rz * np.sin(t)
    return Polygon(np.stack([cx + c * x - s * z, cz + s * x + c * z], -1))


# ───────────────────────────── source geometry ─────────────────────────────

REGION = box(-81.45, 27.75, -79.7, 29.25)
land = []
for s in fetch('ne_10m_land').shapes():
    if s.shapeType == 0:
        continue
    g = shape(s.__geo_interface__)
    if g.intersects(REGION):
        land.append(g.intersection(REGION))
land = geo_to_site(unary_union(land))

water_extra = []
for s in fetch('ne_10m_lakes_north_america').shapes():
    if s.shapeType == 0:
        continue
    g = shape(s.__geo_interface__)
    if g.intersects(REGION):
        water_extra.append(geo_to_site(g.intersection(REGION)))
river_lines = []
for sr in fetch('ne_10m_rivers_lake_centerlines').shapeRecords():
    if sr.shape.shapeType == 0:
        continue
    g = shape(sr.shape.__geo_interface__)
    if g.intersects(REGION):
        river_lines.append(geo_to_site(g.intersection(REGION)))
rivers = unary_union(river_lines)
# the St. Johns: a slow river of marshes and lakes; width ~150 m, two illustrative lakes on it
water_extra.append(rivers.buffer(75, quad_segs=4))
for lon, lat, rx, rz, rot in [(-80.838, 28.345, 2600, 1700, 0.5), (-80.848, 28.255, 1500, 1100, -0.3)]:
    x, z = to_local(lon, lat)
    water_extra.append(ellipse(float(x), float(z), rx, rz, rot))
# round the 1:10m polygon corners (close then open) so coasts do not read as straight chords
land = land.buffer(150, quad_segs=8).buffer(-300, quad_segs=8).buffer(150, quad_segs=8)
land = unary_union([p for p in polys_of(land) if p.area > 2e5])

# ───────────────────────────── ocean vs lagoon ─────────────────────────────

gc = (np.arange(N_COVER) + 0.5) / N_COVER * 2 * EXT - EXT
CX, CZ = np.meshgrid(gc, gc)  # [row=z, col=x]
shapely.prepare(land)
land_c = shapely.contains_xy(land, CX.ravel(), CZ.ravel()).reshape(CX.shape)
water_c = ~land_c
lab, n = ndimage.label(water_c)
edge_labels = set(np.unique(lab[:, -1])) - {0}
ocean_c = np.isin(lab, list(edge_labels))


def ocean_at(x, z):
    i = np.clip(((np.asarray(z) + EXT) / (2 * EXT) * N_COVER).astype(int), 0, N_COVER - 1)
    j = np.clip(((np.asarray(x) + EXT) / (2 * EXT) * N_COVER).astype(int), 0, N_COVER - 1)
    return ocean_c[i, j]


# ───────────────────────────── coastline detail ─────────────────────────────

def detail_ring(coords):
    pts = np.asarray(coords)[:-1]
    if len(pts) < 8:
        return None
    nxt = np.roll(pts, -1, 0)
    prv = np.roll(pts, 1, 0)
    t = nxt - prv
    t /= np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-9)
    nrm = np.stack([t[:, 1], -t[:, 0]], -1)  # away from land for oriented rings
    probe = pts + nrm * 150
    oc = ocean_at(probe[:, 0], probe[:, 1]).astype(float)
    oc = ndimage.uniform_filter1d(oc, 9, mode='wrap')
    # smooth along the ring (30 m samples): long gentle curves on the open coast, less on lagoons
    if len(pts) > 60:
        wide = np.stack([ndimage.gaussian_filter1d(pts[:, k], 22, mode='wrap') for k in (0, 1)], -1)
        narrow = np.stack([ndimage.gaussian_filter1d(pts[:, k], 4, mode='wrap') for k in (0, 1)], -1)
        pts = wide * oc[:, None] + narrow * (1 - oc[:, None])
    big = fbm(pts[:, 0], pts[:, 1], 2600, 4, 3) * 160 + fbm(pts[:, 0], pts[:, 1], 520, 3, 7) * 55
    small = fbm(pts[:, 0], pts[:, 1], 900, 3, 11) * 14
    amp = oc * small + (1 - oc) * big
    near_pad = np.hypot(pts[:, 0], pts[:, 1])
    amp *= np.clip((near_pad - 1500) / 2500, 0.25, 1.0)  # keep the shoreline at the pad clean
    out = pts + nrm * amp[:, None]
    return np.vstack([out, out[:1]])


def detail(poly):
    poly = orient(shapely.segmentize(poly, 30.0), 1.0)
    ext = detail_ring(poly.exterior.coords)
    if ext is None:
        return poly
    holes = [h for h in (detail_ring(i.coords) for i in poly.interiors) if h is not None]
    return Polygon(ext, holes).buffer(0)


land = unary_union([detail(p) for p in polys_of(land)])
land = land.difference(unary_union(water_extra))

# ───────────────────────────── illustrative features ─────────────────────────────

rng = np.random.default_rng(28)
# spoil islands in the lagoons (dredged channel spoil), one carrying the long-range tracking camera
islands = [ellipse(-5200, 3600, 110, 80, 0.3)]
shapely.prepare(land)
tries = 0
while len(islands) < 46 and tries < 20000:
    tries += 1
    x, z = rng.uniform(-30000, 20000), rng.uniform(-35000, 42000)
    if ocean_at(x, z) or shapely.contains_xy(land, x, z):
        continue
    if land.boundary.distance(Point(x, z)) < 450:
        continue
    if math.hypot(x, z) < 2500:
        continue
    r = rng.uniform(35, 120)
    islands.append(ellipse(x, z, r * rng.uniform(1.0, 2.2), r, rng.uniform(1.2, 1.9)))
land = unary_union([land] + islands)

# a port through the barrier island ~10 km south of the pad: entrance channel, turning basin
port = unary_union([
    Polygon([(-3700, 10330), (-700, 10290), (-700, 10470), (-3700, 10510)]),  # channel ~180 m
    ellipse(-3050, 10360, 520, 230, -0.02),  # turning basin
    Polygon([(-1650, 10250), (-1300, 10240), (-1300, 10560), (-1650, 10560)]),
])
jetties = unary_union([
    Polygon([(-1350, 10270), (-500, 10200), (-500, 10230), (-1350, 10300)]),
    Polygon([(-1350, 10460), (-520, 10560), (-520, 10590), (-1350, 10490)]),
])
land = land.difference(port).union(jetties)
land = unary_union([p for p in polys_of(land.buffer(0)) if p.area > 1500])

# ───────────────────────────── signed distance field ─────────────────────────────

rings = []
for p in polys_of(land):
    for r in [p.exterior, *p.interiors]:
        c = np.asarray(shapely.segmentize(LineString(r.coords), 20.0).coords)
        rings.append(c)
verts = np.concatenate([r[:-1] for r in rings])
nxt_idx = np.concatenate([np.roll(np.arange(len(r) - 1), -1) + off for r, off in zip(rings, np.cumsum([0] + [len(r) - 1 for r in rings[:-1]]))])
prv_idx = np.concatenate([np.roll(np.arange(len(r) - 1), 1) + off for r, off in zip(rings, np.cumsum([0] + [len(r) - 1 for r in rings[:-1]]))])
tree = cKDTree(verts)
gs = (np.arange(N_SDF) + 0.5) / N_SDF * 2 * EXT - EXT
SX, SZ = np.meshgrid(gs, gs)
q = np.stack([SX.ravel(), SZ.ravel()], -1)
_, idx = tree.query(q, k=1, workers=-1)


def seg_dist(p, a, b):
    ab = b - a
    t = np.clip(np.einsum('ij,ij->i', p - a, ab) / np.maximum(np.einsum('ij,ij->i', ab, ab), 1e-9), 0, 1)
    c = a + ab * t[:, None]
    return np.linalg.norm(p - c, axis=1)


d = np.minimum(seg_dist(q, verts[idx], verts[nxt_idx[idx]]), seg_dist(q, verts[prv_idx[idx]], verts[idx]))
shapely.prepare(land)
inside = shapely.contains_xy(land, q[:, 0], q[:, 1])
sdf = np.where(inside, d, -d).reshape(N_SDF, N_SDF)
code = np.clip(np.round((sdf + SDF_RANGE) / SDF_STEP), 0, 65535).astype(np.uint32)
img = np.zeros((N_SDF, N_SDF, 3), np.uint8)
img[..., 0] = code >> 8
img[..., 1] = code & 255
img[..., 2] = 255
OUT_TEX.mkdir(parents=True, exist_ok=True)
Image.fromarray(img, 'RGB').save(OUT_TEX / 'coast_sdf.png', optimize=True)

# ───────────────────────────── cover: ocean, marsh, towns ─────────────────────────────

land_c = shapely.contains_xy(land, CX.ravel(), CZ.ravel()).reshape(CX.shape)
water_c = ~land_c
ocean2 = water_c & ocean_c
# the port channel is salt water open to the sea
ocean2 |= water_c & (np.abs(CZ - 10400) < 400) & (CX > -3800) & (CX < -400)
lagoon = water_c & ~ocean2
ocean_f = ndimage.gaussian_filter(ocean2.astype(float), 1.2)
ocean_f = np.where(water_c, np.where(ocean2, 1.0, np.minimum(ocean_f, 0.35)), ocean_f)

px = 2 * EXT / N_COVER
dist_lagoon = ndimage.distance_transform_edt(~lagoon) * px
n1 = fbm(CX, CZ, 1800, 4, 21)
n2 = fbm(CX, CZ, 500, 3, 23)
marsh = np.clip((700 + n1 * 500 - dist_lagoon) / 350, 0, 1) * np.clip(0.5 + n2 * 1.4, 0, 1)
# the St. Johns floodplain: broad marsh prairie either side of the river
dist_river = np.full(CX.shape, 1e9)
if not rivers.is_empty:
    rp = np.asarray(shapely.segmentize(rivers, 200.0).coords if rivers.geom_type == 'LineString' else np.concatenate([np.asarray(shapely.segmentize(l, 200.0).coords) for l in rivers.geoms]))
    dr, _ = cKDTree(rp).query(np.stack([CX.ravel(), CZ.ravel()], -1), workers=-1)
    dist_river = dr.reshape(CX.shape)
marsh = np.maximum(marsh, np.clip((3200 + n1 * 1400 - dist_river) / 900, 0, 1) * np.clip(0.75 + n2, 0, 1))
marsh = np.where(land_c, marsh, 0)

# towns (illustrative): mainland shore strips, south Merritt Island, the beach towns south of the port
towns = [
    LineString([(-24000, -15500), (-21600, -9000), (-21000, -3500)]).buffer(1900),  # north mainland town
    LineString([(-20600, 2500), (-19500, 9000), (-17600, 15000), (-15400, 21000), (-12600, 28000)]).buffer(2100),
    LineString([(-9500, 30000), (-6200, 40000), (-3500, 48000)]).buffer(2300),
    LineString([(-11800, 9500), (-12200, 16000), (-11200, 24000)]).buffer(1700),  # south Merritt Island
    LineString([(-2700, 11500), (-2700, 20000), (-2300, 30000), (-1600, 42000)]).buffer(900),  # beach towns
]
tw = unary_union(towns)
shapely.prepare(tw)
town_c = shapely.contains_xy(tw, CX.ravel(), CZ.ravel()).reshape(CX.shape).astype(float)
town_c = ndimage.gaussian_filter(town_c, 3.0)
n3 = fbm(CX, CZ, 1400, 4, 31)
urban = np.clip((town_c - 0.35 + n3 * 0.45) * 2.2, 0, 1)
urban = np.where(land_c, urban, 0)

cov = np.zeros((N_COVER, N_COVER, 3), np.uint8)
cov[..., 0] = np.round(np.clip(ocean_f, 0, 1) * 255)
cov[..., 1] = np.round(np.clip(marsh, 0, 1) * 255)
cov[..., 2] = np.round(np.clip(urban, 0, 1) * 255)
Image.fromarray(cov, 'RGB').save(OUT_TEX / 'cover.png', optimize=True)

# ───────────────────────────── regional roads ─────────────────────────────
# Illustrative network (pad-local metres). 'w' is the paved width.
ROADS = [
    # the Cape road along the barrier island, west of the launch complex
    dict(kind='road', w=12, pts=[(-2900, 10060), (-2300, 8600), (-1950, 7200), (-1700, 5200), (-1500, 2600), (-1400, 400), (-1380, -1500), (-1300, -4200), (-1450, -7000), (-1700, -9300)]),
    # causeway east over the Banana River to Merritt Island
    dict(kind='road', w=12, pts=[(-1380, -1500), (-2600, -1550), (-4200, -1580), (-6000, -1620), (-7600, -1800), (-10200, -2050)]),
    # Merritt Island north-south parkway
    dict(kind='road', w=14, pts=[(-9200, -12500), (-9800, -8000), (-10200, -2050), (-10350, 3000), (-10100, 8000), (-10000, 10600), (-9800, 15500), (-9900, 22000), (-9600, 30000)]),
    # causeway west over the Indian River
    dict(kind='road', w=14, pts=[(-10200, -2050), (-13000, -2300), (-15600, -2450), (-18000, -2500), (-20600, -2600), (-22500, -2700)]),
    # mainland shore highway
    dict(kind='highway', w=18, pts=[(-27500, -24000), (-24600, -15000), (-22300, -8000), (-21700, -2600), (-20900, 3000), (-19700, 9000), (-17900, 15000), (-15700, 21000), (-12900, 28000), (-10200, 35000), (-7400, 42000), (-4800, 50000)]),
    # inland interstate
    dict(kind='highway', w=30, pts=[(-33500, -50000), (-31000, -30000), (-29500, -15000), (-28400, -2000), (-27000, 10000), (-24800, 22000), (-21200, 34000), (-17000, 46000), (-15500, 52000)]),
    # east-west expressway to the port (crosses both lagoons)
    dict(kind='highway', w=26, pts=[(-52000, 11500), (-38000, 11000), (-27000, 10000), (-22000, 10300), (-19400, 10400), (-16000, 10600), (-12000, 10700), (-10000, 10600), (-7800, 10550), (-4800, 10200), (-3700, 10150)]),
    # second causeway road further south
    dict(kind='road', w=16, pts=[(-25200, 15400), (-20500, 15300), (-18200, 15300), (-15000, 15500), (-11000, 15600), (-9800, 15500), (-8200, 15600), (-5000, 15700), (-2750, 15700)]),
    # beach road south of the port
    dict(kind='road', w=14, pts=[(-2950, 10800), (-2800, 13500), (-2700, 15700), (-2650, 20000), (-2350, 26000), (-2000, 32000), (-1550, 38000)]),
    # road to Titusville-like town across the north of Merritt Island
    dict(kind='road', w=12, pts=[(-9200, -12500), (-12500, -13200), (-16000, -12600), (-19500, -11000), (-22800, -9000)]),
]
road_out = []
for r in ROADS:
    ls = shapely.segmentize(LineString(r['pts']), 60.0)
    road_out.append({'kind': r['kind'], 'w': r['w'], 'pts': [round(v, 1) for xy in ls.coords for v in xy]})

OUT_TS.parent.mkdir(parents=True, exist_ok=True)
OUT_TS.write_text(
    '/* Generated by tools/site/bake_site.py. Do not edit by hand. */\n'
    '/** Baked map extents (pad-local metres) and encodings shared with the terrain shader. */\n'
    f'export const SITE_MAP = {{ ext: {EXT}, sdfSize: {N_SDF}, coverSize: {N_COVER}, sdfRange: {SDF_RANGE}, sdfStep: {SDF_STEP} }};\n'
    '/** Illustrative regional roads: pad-local polylines [x0, z0, x1, z1, ...] (m), paved width (m). */\n'
    'export const REGIONAL_ROADS: { kind: \'road\' | \'highway\'; w: number; pts: number[] }[] = '
    + json.dumps(road_out, separators=(',', ':')) + ';\n'
)

# report
land_pad = shapely.contains_xy(land, 0.0, 0.0)
coast_e = LineString([(0, 0), (6000, 0)]).intersection(land.boundary)
print('pad on land:', land_pad, ' coast crossing east of pad:', coast_e)
print('LZ on land:', shapely.contains_xy(land, -600.0, 8600.0), ' LZ to coast:', round(land.boundary.distance(Point(-600, 8600))), 'm')
print('tracking camera on land:', shapely.contains_xy(land, -5200.0, 3600.0))
for r in ROADS:
    pts = np.asarray(shapely.segmentize(LineString(r['pts']), 100.0).coords)
    wet = ~shapely.contains_xy(land, pts[:, 0], pts[:, 1])
    print('road', r['pts'][0], 'water fraction %.2f' % wet.mean())
print('wrote', OUT_TEX / 'coast_sdf.png', (OUT_TEX / 'coast_sdf.png').stat().st_size, 'bytes;', OUT_TEX / 'cover.png', (OUT_TEX / 'cover.png').stat().st_size, 'bytes')
