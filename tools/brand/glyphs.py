"""Extract wordmark glyph outlines from Archivo (SIL Open Font License 1.1) as SVG path data.

Usage: python3 tools/brand/glyphs.py <text> <wght> <wdth> [tracking_em]
Prints JSON: {"d": <path>, "width": <advance units>, "ascent":..., "capHeight":...}
The font file is the one bundled by @fontsource-variable/archivo (latin, width+weight axes).
"""
import json, sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

text, wght, wdth = sys.argv[1], float(sys.argv[2]), float(sys.argv[3])
track = float(sys.argv[4]) if len(sys.argv) > 4 else 0.0
f = TTFont('node_modules/@fontsource-variable/archivo/files/archivo-latin-standard-normal.woff2')
axes = {a.axisTag: (a.minValue, a.maxValue) for a in f['fvar'].axes}
loc = {}
if 'wght' in axes: loc['wght'] = max(axes['wght'][0], min(axes['wght'][1], wght))
if 'wdth' in axes: loc['wdth'] = max(axes['wdth'][0], min(axes['wdth'][1], wdth))
inst = instancer.instantiateVariableFont(f, loc)
gs = inst.getGlyphSet()
cmap = inst.getBestCmap()
upm = inst['head'].unitsPerEm
cap = getattr(inst['OS/2'], 'sCapHeight', 0) or 0
x = 0
parts = []
for ch in text:
    if ch == ' ':
        x += gs[cmap[ord(' ')]].width + track * upm
        continue
    gname = cmap[ord(ch)]
    pen = SVGPathPen(gs)
    # flip y (font units are y-up) and shift by the pen position
    tp = TransformPen(pen, (1, 0, 0, -1, x, 0))
    gs[gname].draw(tp)
    parts.append(pen.getCommands())
    x += gs[gname].width + track * upm
print(json.dumps({'d': ' '.join(parts), 'width': x - track * upm, 'upm': upm, 'capHeight': cap, 'axes': axes, 'loc': loc}))
