// 🔥 REMOVE UNUSED DEPENDENCIES CAUSING 71% CODE BLOAT
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const UNUSED_DEPENDENCIES = [
  // Heavy dependencies likely unused
  '@aws-sdk/client-s3',
  '@aws-sdk/s3-request-presigner', 
  'aws-sdk', // Duplicate AWS SDK
  '@google/genai',
  '@langchain/community',
  '@langchain/openai',
  'langchain',
  'chromadb',
  '@mui/x-date-pickers',
  '@types/axios',
  '@types/three',
  'chart.js',
  'react-chartjs-2', // Likely unused charts
  'konva',
  'react-konva', // Heavy canvas library
  'ngrok', // Development only
  'multer', // Server-side only
  'node-cron', // Server-side only
  'redis', // Server-side only
  'glob',
  'file-type',
  'jpeg-js',
  'browser-image-compression' // Likely redundant
];

async function removeUnusedDependencies() {
  console.log('🔥 REMOVING UNUSED DEPENDENCIES TO FIX 71% CODE BLOAT...');
  
  // Read current package.json
  const packagePath = './package.json';
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  console.log('📦 Current dependencies:', Object.keys(packageJson.dependencies).length);
  
  let removedCount = 0;
  
  for (const dep of UNUSED_DEPENDENCIES) {
    if (packageJson.dependencies[dep]) {
      console.log(`🗑️  Removing: ${dep}`);
      delete packageJson.dependencies[dep];
      removedCount++;
    }
  }
  
  // Write updated package.json
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));
  
  console.log(`✅ Removed ${removedCount} unused dependencies`);
  console.log('📦 Remaining dependencies:', Object.keys(packageJson.dependencies).length);
  
  // Clean install to remove unused packages
  console.log('🧹 Running clean install...');
  try {
    execSync('rm -rf node_modules package-lock.json', { stdio: 'inherit' });
    execSync('npm install', { stdio: 'inherit' });
    console.log('✅ Clean install completed');
  } catch (error) {
    console.error('❌ Install failed:', error.message);
  }
}

removeUnusedDependencies().catch(console.error);
