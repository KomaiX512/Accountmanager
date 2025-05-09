import fs from 'fs';
import path from 'path';
import jpeg from 'jpeg-js';

// Create directory if it doesn't exist
const dir = 'public';
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

// Create a simple JPEG with a gradient
const width = 600;
const height = 400;
const buffer = Buffer.alloc(width * height * 4);

// Fill with gradient from pink to purple (lipstick-like colors)
for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const r = Math.floor(200 + (x / width) * 55);
    const g = Math.floor(100 + (y / height) * 55);
    const b = Math.floor(150 + ((x + y) / (width + height)) * 105);
    const a = 255; // Full opacity
    
    buffer[i] = r;     // Red
    buffer[i + 1] = g; // Green
    buffer[i + 2] = b; // Blue
    buffer[i + 3] = a; // Alpha
  }
}

// Write the JPEG file
const outputPath = path.join(dir, 'fallback.jpg');
const jpegImageData = jpeg.encode({ data: buffer, width, height }, 90);
fs.writeFileSync(outputPath, jpegImageData.data);

console.log(`Fallback image created at ${outputPath}`); 