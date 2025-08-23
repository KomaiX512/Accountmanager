#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create icons directory if it doesn't exist
function createIconsDirectory() {
  const iconsDir = path.join(__dirname, '..', 'public', 'icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
    console.log('Created icons directory:', iconsDir);
  }
  return iconsDir;
}

// Copy logo to create basic PWA icons
function createBasicIcons(sourceLogo, iconsDir) {
  const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
  
  console.log('Creating PWA icons from your logo...');
  
  sizes.forEach(size => {
    const outputPath = path.join(iconsDir, `icon-${size}x${size}.png`);
    
    try {
      // Copy the logo file to create icons
      fs.copyFileSync(sourceLogo, outputPath);
      console.log(`✓ Created ${size}x${size} icon`);
    } catch (error) {
      console.error(`✗ Failed to create ${size}x${size} icon:`, error.message);
    }
  });
}

// Main function
function main() {
  const sourceLogo = path.join(__dirname, '..', 'Logo', 'logo.png');
  
  if (!fs.existsSync(sourceLogo)) {
    console.error('❌ Source logo not found at:', sourceLogo);
    console.error('   Please ensure your logo exists at Logo/logo.png');
    process.exit(1);
  }
  
  const iconsDir = createIconsDirectory();
  createBasicIcons(sourceLogo, iconsDir);
  
  console.log('\n✅ Basic PWA icons created successfully!');
  console.log('📱 Your app will now use your logo as the app icon');
  console.log('💡 For better quality, run: node scripts/generate-pwa-icons.js (requires ImageMagick)');
  console.log('🔧 Test the installation on a mobile device');
}

// Run main function
main();
