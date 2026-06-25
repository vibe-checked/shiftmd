// Generates app icon, splash, adaptive foreground & favicon from inline SVG.
// Run: node scripts/make-icons.js
const sharp = require('sharp');
const path = require('path');

const ASSETS = path.join(__dirname, '..', 'assets');

// --- The medical-calendar mark, drawn centered on a 1024 canvas. -----------
// `bg` = optional full-bleed background (gradient) for the iOS icon.
// When bg is omitted the background is transparent (for splash / adaptive).
function svg({ withBg }) {
  const background = withBg
    ? `<rect width="1024" height="1024" fill="url(#bg)"/>
       <circle cx="300" cy="210" r="540" fill="#FFFFFF" opacity="0.06"/>`
    : '';
  // Mark is slightly smaller when transparent so it has breathing room.
  const scale = withBg ? 1 : 0.82;
  const tx = (1024 - 1024 * scale) / 2;
  return `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.25" y2="1">
      <stop offset="0" stop-color="#4F8DF7"/>
      <stop offset="0.5" stop-color="#2563EB"/>
      <stop offset="1" stop-color="#1A45C7"/>
    </linearGradient>
    <filter id="sh" x="-30%" y="-30%" width="160%" height="160%">
      <feDropShadow dx="0" dy="20" stdDeviation="28" flood-color="#0A2570" flood-opacity="${withBg ? 0.38 : 0.18}"/>
    </filter>
  </defs>
  ${background}
  <g transform="translate(${tx} ${tx}) scale(${scale})">
    <!-- binding tabs -->
    <rect x="372" y="236" width="42" height="104" rx="21" fill="${withBg ? '#DCE6F7' : '#C9D6EE'}"/>
    <rect x="610" y="236" width="42" height="104" rx="21" fill="${withBg ? '#DCE6F7' : '#C9D6EE'}"/>
    <!-- calendar body -->
    <g filter="url(#sh)">
      <rect x="244" y="288" width="536" height="504" rx="68" fill="#FFFFFF"/>
      <path d="M244 392 V356 A68 68 0 0 1 312 288 H712 A68 68 0 0 1 780 356 V392 Z" fill="#2563EB"/>
    </g>
    <!-- medical cross -->
    <g fill="#2563EB">
      <rect x="468" y="446" width="88" height="286" rx="30"/>
      <rect x="369" y="545" width="286" height="88" rx="30"/>
    </g>
    <!-- confirmed check badge -->
    <circle cx="744" cy="720" r="96" fill="#FFFFFF"/>
    <circle cx="744" cy="720" r="78" fill="#16A34A"/>
    <path d="M705 721 l26 28 l50 -57" fill="none" stroke="#FFFFFF" stroke-width="22"
          stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>`;
}

async function render(svgStr, size, out) {
  await sharp(Buffer.from(svgStr))
    .resize(size, size)
    .png()
    .toFile(path.join(ASSETS, out));
  console.log('wrote', out, `${size}x${size}`);
}

(async () => {
  const iconSvg = svg({ withBg: true });
  const markSvg = svg({ withBg: false });
  await render(iconSvg, 1024, 'icon.png');
  await render(markSvg, 1024, 'splash-icon.png');
  await render(markSvg, 1024, 'android-icon-foreground.png');
  await render(iconSvg, 196, 'favicon.png');
  console.log('done');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
