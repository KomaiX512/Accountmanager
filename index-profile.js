import chromaDBService from './chromadb-service.js';
import fs from 'fs';
import path from 'path';

async function indexProfile(username, platform, useStructureDB = false) {
  try {
    // Initialize ChromaDB
    await chromaDBService.initialize();
    
    let profilePath;
    if (useStructureDB) {
      // Use the structuredb data
      profilePath = path.join(process.cwd(), 'data', 'cache', `${platform}_${username}_profile_structuredb.json`);
    } else {
      // Use the original cache data
      profilePath = path.join(process.cwd(), 'data', 'cache', `${platform}_${username}_profile.json`);
    }
    
    if (!fs.existsSync(profilePath)) {
      console.error(`Profile file not found: ${profilePath}`);
      return false;
    }
    
    const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    console.log(`[Index] Found profile data for ${platform}/${username} ${useStructureDB ? '(StructureDB)' : '(Cache)'}`);
    console.log(`[Index] Data structure:`, Object.keys(profileData));
    
    // Store in ChromaDB
    const success = await chromaDBService.storeProfileData(username, platform, profileData);
    
    if (success) {
      console.log(`[Index] ✅ Successfully indexed ${platform}/${username} profile data`);
      
      // Get stats to verify
      const stats = await chromaDBService.getStats(platform);
      console.log(`[Index] Collection stats:`, stats);
    } else {
      console.error(`[Index] ❌ Failed to index ${platform}/${username} profile data`);
    }
    
    return success;
  } catch (error) {
    console.error(`[Index] Error indexing profile:`, error);
    return false;
  }
}

// Run if called directly
if (process.argv[2] && process.argv[3]) {
  const platform = process.argv[2];
  const username = process.argv[3];
  const useStructureDB = process.argv[4] === '--structuredb';
  indexProfile(username, platform, useStructureDB).then(success => {
    process.exit(success ? 0 : 1);
  });
}

export { indexProfile };
