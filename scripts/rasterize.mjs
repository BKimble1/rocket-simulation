// Rasterize an SVG or HTML file to PNG with Chromium: node scripts/rasterize.mjs <in.svg|html> <out.png> [width] [height] [bg]
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
const [, , input, out, w = '800', h = '400', bg = '#ffffff'] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const src = readFileSync(input, 'utf8');
const html = input.endsWith('.svg') ? `<html><body style="margin:0;background:${bg};display:grid;place-items:center;height:100vh"><div style="width:90%;height:80%;display:grid;place-items:center">${src.replace('<svg ', '<svg style="width:100%;height:100%" ')}</div></body></html>` : src;
await page.setContent(html);
await page.screenshot({ path: out });
await browser.close();
