const sharp = require('sharp'); const fs = require('fs'); const path = require('path');
const [dir, out1, out2] = process.argv.slice(2);
(async () => {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
  const W = 1144, H = 230, L = 22, s = 0.6;
  const mk = async (list, out) => { const tiles = []; let y = 0;
    for (const f of list) { tiles.push({ input: Buffer.from(`<svg width="${W*s}" height="${L}"><rect width="100%" height="100%" fill="#7c3aed"/><text x="6" y="16" font-size="14" font-family="sans-serif" fill="white">${f}</text></svg>`), top: y, left: 0 }); y += L;
      tiles.push({ input: await sharp(path.join(dir, f)).resize(Math.round(W*s)).toBuffer(), top: y, left: 0 }); y += Math.round(H*s); }
    await sharp({ create: { width: Math.round(W*s), height: y, channels: 3, background: '#000' } }).composite(tiles).png().toFile(out); };
  const half = Math.ceil(files.length / 2); await mk(files.slice(0, half), out1); await mk(files.slice(half), out2);
})();
