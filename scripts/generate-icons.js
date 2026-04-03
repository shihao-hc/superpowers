const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgPath = path.join(__dirname, '..', 'frontend', 'icons', 'icon.svg');
const outputDir = path.join(__dirname, '..', 'frontend', 'icons');
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons() {
  const svgBuffer = fs.readFileSync(svgPath);
  
  for (const size of sizes) {
    const outputPath = path.join(outputDir, `icon-${size}x${size}.png`);
    await sharp(svgBuffer)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`Created ${size}x${size} icon`);
  }
  
  const shortcutOutput = path.join(outputDir, 'chat-shortcut.png');
  await sharp(svgBuffer)
    .resize(96, 96)
    .png()
    .toFile(shortcutOutput);
  console.log('Created chat-shortcut.png');
  
  const personalityOutput = path.join(outputDir, 'personality-shortcut.png');
  await sharp(svgBuffer)
    .resize(96, 96)
    .png()
    .toFile(personalityOutput);
  console.log('Created personality-shortcut.png');
  
  console.log('All icons generated successfully!');
}

generateIcons().catch(console.error);
