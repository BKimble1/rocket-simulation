"""Regenerate public/textures/* from public-domain sources (see README.md in this folder)."""
import io, os, subprocess, sys, tarfile, urllib.request, zipfile, pathlib, tempfile, json
import numpy as np
from PIL import Image, ImageFilter

Image.MAX_IMAGE_PIXELS = None
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'textures'
TMP = pathlib.Path(tempfile.mkdtemp())


def fetch(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=300) as r:
        return r.read()


def npm_tarball(pkg: str) -> bytes:
    meta = json.loads(fetch(f'https://registry.npmjs.org/{pkg}'))
    ver = meta['dist-tags']['latest'] if '@' not in pkg[1:] else None
    return fetch(meta['versions'][ver]['dist']['tarball'])


def main():
    (OUT / 'earth').mkdir(parents=True, exist_ok=True)
    (OUT / 'moon').mkdir(parents=True, exist_ok=True)
    (OUT / 'sky').mkdir(parents=True, exist_ok=True)
    # Blue Marble NG via basemap-data (PyPI)
    subprocess.check_call([sys.executable, '-m', 'pip', 'download', 'basemap-data==2.0.0', '--no-deps', '-d', str(TMP)])
    whl = next(TMP.glob('basemap_data-*.whl'))
    day = Image.open(io.BytesIO(zipfile.ZipFile(whl).read('mpl_toolkits/basemap_data/bmng.jpg'))).convert('RGB')
    for w in (4096, 2048):
        day.resize((w, w // 2), Image.LANCZOS).save(OUT / 'earth' / f'day_{w}.jpg', quality=88, optimize=True, progressive=True)
    a = np.asarray(day.resize((2048, 1024), Image.LANCZOS)).astype(np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    water = ((b > r * 1.05) & (b > g * 0.9) & (lum < 0.42)) | ((lum < 0.12) & (b >= r))
    Image.fromarray((water * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.GaussianBlur(0.8)).save(OUT / 'earth' / 'water_2048.png', optimize=True)
    # Black Marble 2012 via NASA WorldWind (npm)
    meta = json.loads(fetch('https://registry.npmjs.org/@nasaworldwind/worldwind'))
    tgz = fetch(meta['versions']['0.11.1']['dist']['tarball'])
    with tarfile.open(fileobj=io.BytesIO(tgz)) as t:
        night = Image.open(t.extractfile('package/build/dist/images/dnb_land_ocean_ice_2012.png')).convert('RGB')
    night.save(OUT / 'earth' / 'night_2048.jpg', quality=85, optimize=True)
    # Tycho star map (NASA 3D Resources on GitHub)
    stars = Image.open(io.BytesIO(fetch('https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/Images%20and%20Textures/Tycho%20Star%20Map/Tycho%20Star%20Map.jpg'))).convert('RGB')
    stars.save(OUT / 'sky' / 'tycho_2880.jpg', quality=88, optimize=True)
    # Moon (LROC WAC mosaic, sampled over HTTP ranges)
    here = pathlib.Path(__file__).resolve().parent
    subprocess.check_call([sys.executable, str(here / 'lroc_extract.py'), '4096', '2048'], cwd=TMP)
    moon = Image.open(TMP / 'moon_lroc_wac_4096x2048.png').convert('L')
    moon.save(OUT / 'moon' / 'lroc_4096.jpg', quality=86, optimize=True, progressive=True)
    moon.resize((2048, 1024), Image.LANCZOS).save(OUT / 'moon' / 'lroc_2048.jpg', quality=86, optimize=True)
    print('done')


if __name__ == '__main__':
    main()
