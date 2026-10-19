import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
mkdirSync('public/icons', { recursive: true });
const svg = (pad, bg = true) => `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1f9d8a"/><stop offset="1" stop-color="#2f6fed"/>
    </linearGradient>
  </defs>
  ${bg ? `<rect width="512" height="512" rx="${pad ? 0 : 112}" fill="url(#g)"/>` : ''}
  <g transform="translate(256 256) scale(${pad ? 0.72 : 0.84}) translate(-256 -256)">
    <path d="M256 92 L96 228 L136 228 L136 400 L376 400 L376 228 L416 228 Z" fill="none" stroke="#ffffff" stroke-width="30" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M196 290 L240 334 L324 240" fill="none" stroke="#ffffff" stroke-width="34" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
await sharp(Buffer.from(svg(false))).resize(192).png().toFile('public/icons/icon-192.png');
await sharp(Buffer.from(svg(false))).resize(512).png().toFile('public/icons/icon-512.png');
await sharp(Buffer.from(svg(true))).resize(512).png().toFile('public/icons/maskable-512.png');
await sharp(Buffer.from(svg(true))).resize(180).png().toFile('public/icons/apple-touch-icon.png');
const badge = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 512 512">
  <path d="M256 92 L96 228 L136 228 L136 400 L376 400 L376 228 L416 228 Z" fill="none" stroke="#000" stroke-width="40" stroke-linejoin="round"/>
  <path d="M196 290 L240 334 L324 240" fill="none" stroke="#000" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
await sharp(Buffer.from(badge)).resize(96).png().toFile('public/icons/badge-96.png');
console.log('icons ok');
