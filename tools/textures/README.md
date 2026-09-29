# Texture preparation (reproducible)

All imagery is public domain and is served locally from `public/textures/` (no runtime
hotlinks). These scripts regenerate it from the original sources.

```sh
pip install pillow numpy rasterio
python3 tools/textures/fetch_and_prepare.py      # downloads sources, writes public/textures/*
```

| Output | Source | How obtained |
|---|---|---|
| `earth/day_4096.jpg`, `earth/day_2048.jpg` | NASA Blue Marble Next Generation (Reto Stöckli, NASA Earth Observatory), 5400 x 2700 `bmng.jpg` | `basemap-data==2.0.0` wheel from PyPI (the matplotlib basemap project ships NASA's image; its docs credit visibleearth.nasa.gov). Lanczos resize. |
| `earth/water_2048.png` | derived from the Blue Marble image | colour classification (blue-dominant, dark) + median filter; white = water. |
| `earth/night_2048.jpg` | NASA Black Marble 2012 (NASA Earth Observatory / NOAA NGDC, Suomi NPP VIIRS) `dnb_land_ocean_ice_2012.png` | `@nasaworldwind/worldwind@0.11.1` npm package (NASA WorldWind). Re-encoded as JPEG. |
| `moon/lroc_4096.jpg`, `moon/lroc_2048.jpg` | LRO LROC WAC global mosaic, 100 m/pixel, June 2013 (NASA / GSFC / Arizona State University), hosted by USGS Astrogeology | `lroc_extract.py`: reads one row every ~27 rows of the 109,164 x 54,582 GeoTIFF over HTTP range requests (GDAL /vsicurl/) and box-filters each row horizontally; no full download. |
| `sky/tycho_2880.jpg` | NASA 3D Resources, "Tycho Star Map" (NASA) | `raw.githubusercontent.com/nasa/NASA-3D-Resources/master/Images and Textures/Tycho Star Map/Tycho Star Map.jpg`, re-encoded. |

Hosts that were blocked in the build environment (visibleearth.nasa.gov, svs.gsfc.nasa.gov,
planetarymaps.usgs.gov) were not used; the files above are the same public-domain works
obtained through reachable mirrors named in the table.
