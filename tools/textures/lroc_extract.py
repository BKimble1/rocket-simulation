import rasterio, os, time, numpy as np, sys
from rasterio.windows import Window
from concurrent.futures import ThreadPoolExecutor
os.environ['CURL_CA_BUNDLE']='/root/.ccr/ca-bundle.crt'
url='/vsicurl/https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Lunar_LRO_LROC-WAC_Mosaic_global_100m_June2013.tif'
W,H=int(sys.argv[1]),int(sys.argv[2])
env=dict(GDAL_DISABLE_READDIR_ON_OPEN='EMPTY_DIR', CPL_VSIL_CURL_ALLOWED_EXTENSIONS='.tif', GDAL_HTTP_MAX_RETRY='5', GDAL_HTTP_RETRY_DELAY='2')
with rasterio.Env(**env):
  with rasterio.open(url) as ds:
    print(ds.profile.get('compress'), ds.width, ds.height)
out=np.zeros((H,W),np.uint8)
def rowread(i):
  with rasterio.Env(**env):
    with rasterio.open(url) as ds:
      y=int((i+0.5)*ds.height/H)
      # average 3 neighbouring rows is too costly; take one row, box-filter horizontally
      r=ds.read(1, window=Window(0,y,ds.width,1))[0].astype(np.float32)
      n=ds.width//W
      out[i]=np.clip(r[:n*W].reshape(W,n).mean(1),0,255).astype(np.uint8)
  return i
t=time.time()
rows=list(range(H))
chunks=[rows[k::16] for k in range(16)]
def work(ch):
  for i in ch: rowread(i)
with ThreadPoolExecutor(16) as ex: list(ex.map(work,chunks))
print('took',time.time()-t)
from PIL import Image
Image.fromarray(out).save(f'moon_lroc_wac_{W}x{H}.png')
