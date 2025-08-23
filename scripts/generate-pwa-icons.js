#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if ImageMagick is installed
function checkImageMagick() {
  try {
    execSync('convert --version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

// Create icons directory if it doesn't exist
function createIconsDirectory() {
  const iconsDir = path.join(__dirname, '..', 'public', 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
    console.log('Created icons directory:', iconsDir);
  }
  return iconsDir;
}

// Generate icons using ImageMagick
function generateIcons(sourceLogo, iconsDir) {
  const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
  
  console.log('Generating PWA icons...');
  
  sizes.forEach(size => {
    const outputPath = path.join(iconsDir, `icon-${size}x${size}.png`);
    // Create square icon with proper background and centering
    const command = `convert "${sourceLogo}" -resize ${size}x${size} -background white -gravity center -extent ${size}x${size} "${outputPath}"`;
    
    try {
      execSync(command, { stdio: 'ignore' });
      console.log(`✓ Generated ${size}x${size} icon`);
    } catch (error) {
      console.error(`✗ Failed to generate ${size}x${size} icon:`, error.message);
    }
  });
}

// Main function
function main() {
  if (!checkImageMagick()) {
    console.error('❌ ImageMagick is not installed. Please install it first:');
    console.error('   Ubuntu/Debian: sudo apt-get install imagemagick');
    console.error('   macOS: brew install imagemagick');
    console.error('   Windows: Download from https://imagemagick.org/');
    process.exit(1);
  }
  
  const sourceLogo = path.join(__dirname, '..', 'Logo', 'logo.png');
  
  if (!fs.existsSync(sourceLogo)) {
    console.error('❌ Source logo not found at:', sourceLogo);
    console.error('   Please ensure your logo exists at Logo/logo.png');
    process.exit(1);
  }
  
  const iconsDir = createIconsDirectory();
  generateIcons(sourceLogo, iconsDir);
  
  console.log('\n✅ PWA icons generated successfully!');
  console.log('📱 Your app is now ready to be installed as a PWA');
  console.log('🔧 Make sure to test the installation on a mobile device');
}

// Run main function
main();
