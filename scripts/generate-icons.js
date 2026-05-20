import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = path.resolve(process.cwd());
const sourceSvgPath = path.join(root, 'outputs', 'pfp-logo.svg');
const outDir = path.join(root, 'assets');
const outPngPath = path.join(outDir, 'icon.png');
const outIcoPath = path.join(outDir, 'icon.ico');

async function main() {
  if (!fs.existsSync(sourceSvgPath)) {
    throw new Error(`Missing source SVG: ${sourceSvgPath}`);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const svg = fs.readFileSync(sourceSvgPath);

  const png512 = await sharp(svg).resize(512, 512, { fit: 'contain' }).png({ compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(outPngPath, png512);

  const icoSizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = await Promise.all(
    icoSizes.map((s) => sharp(svg).resize(s, s, { fit: 'contain' }).png({ compressionLevel: 9 }).toBuffer())
  );
  const ico = await pngToIco(pngBuffers);
  fs.writeFileSync(outIcoPath, ico);
}

main().catch((e) => {
  process.stderr.write(`${e?.stack || e?.message || String(e)}\n`);
  process.exit(1);
});

