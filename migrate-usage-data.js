import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  endpoint: 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '7e15d4a51abb43fff3a7da4a8813044f',
    secretAccessKey: '8fccd5540c85304347cbbd25d8e1f67776a8473c73c4a8811e83d0970bd461e2',
  },
  maxAttempts: 5,
  retryMode: 'adaptive'
});

async function getJson(bucket, key) {
  try {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(command);
    return JSON.parse(await response.Body.transformToString());
  } catch (error) {
    return null;
  }
}

async function putJson(bucket, key, data) {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: JSON.stringify(data, null, 2),
    ContentType: 'application/json'
  });
  await s3Client.send(command);
}

async function migrateUsageData() {
  console.log('🔄 Starting usage data migration...');
  
  try {
    // Get all users from admin bucket to build platform mapping
    const usersCommand = new ListObjectsV2Command({
      Bucket: 'admin',
      Prefix: 'users/',
      Delimiter: '/'
    });
    
    const usersResponse = await s3Client.send(usersCommand);
    const platformToUidMap = new Map();
    
    console.log(`Found ${usersResponse.CommonPrefixes?.length || 0} users in admin bucket`);
    
    // Build platform/username to UID mapping
    if (usersResponse.CommonPrefixes) {
      for (const userPrefix of usersResponse.CommonPrefixes) {
        const uid = userPrefix.Prefix.replace('users/', '').replace('/', '');
        
        try {
          const userData = await getJson('admin', `users/${uid}/data.json`);
          if (userData) {
            if (userData.instagramUsername) {
              platformToUidMap.set(`instagram_${userData.instagramUsername}`, uid);
              console.log(`Mapped instagram_${userData.instagramUsername} -> ${uid}`);
            }
            if (userData.facebookUsername) {
              platformToUidMap.set(`facebook_${userData.facebookUsername}`, uid);
              console.log(`Mapped facebook_${userData.facebookUsername} -> ${uid}`);
            }
            if (userData.twitterUsername) {
              platformToUidMap.set(`twitter_${userData.twitterUsername}`, uid);
              console.log(`Mapped twitter_${userData.twitterUsername} -> ${uid}`);
            }
          }
        } catch (err) {
          console.warn(`Error reading user data for ${uid}:`, err.message);
        }
      }
    }
    
    // Get legacy usage data from tasks bucket
    const legacyUsageCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'usage/',
      MaxKeys: 1000
    });
    
    const legacyResponse = await s3Client.send(legacyUsageCommand);
    console.log(`Found ${legacyResponse.Contents?.length || 0} legacy usage files`);
    
    let migratedCount = 0;
    let skippedCount = 0;
    
    if (legacyResponse.Contents) {
      for (const item of legacyResponse.Contents) {
        try {
          const legacyUsage = await getJson('tasks', item.Key);
          if (!legacyUsage) {
            console.warn(`Could not read ${item.Key}`);
            skippedCount++;
            continue;
          }
          
          // Extract platform and username from the legacy usage data
          const platform = legacyUsage.platform;
          const username = legacyUsage.username;
          const platformKey = `${platform}_${username}`;
          
          // Find corresponding Firebase UID
          const firebaseUid = platformToUidMap.get(platformKey);
          
          if (firebaseUid) {
            // Migrate to admin bucket with Firebase UID structure
            const period = legacyUsage.period;
            const adminKey = `usage/${firebaseUid}/${period}.json`;
            
            // Check if already exists in admin bucket
            const existingUsage = await getJson('admin', adminKey);
            
            if (!existingUsage) {
              // Create new usage record with Firebase UID
              const migratedUsage = {
                userId: firebaseUid,
                period: period,
                postsUsed: legacyUsage.postsUsed || 0,
                discussionsUsed: legacyUsage.discussionsUsed || 0,
                aiRepliesUsed: legacyUsage.aiRepliesUsed || 0,
                campaignsUsed: legacyUsage.campaignsUsed || 0,
                viewsUsed: legacyUsage.viewsUsed || 0,
                resetsUsed: legacyUsage.resetsUsed || 0,
                lastUpdated: legacyUsage.lastUpdated || new Date().toISOString(),
                // Keep platform info for reference
                migratedFrom: {
                  platform: platform,
                  username: username,
                  legacyKey: item.Key
                }
              };
              
              await putJson('admin', adminKey, migratedUsage);
              console.log(`✅ Migrated ${item.Key} -> admin/usage/${firebaseUid}/${period}.json`);
              migratedCount++;
            } else {
              // Merge usage data if both exist
              const mergedUsage = {
                ...existingUsage,
                postsUsed: Math.max(existingUsage.postsUsed || 0, legacyUsage.postsUsed || 0),
                discussionsUsed: Math.max(existingUsage.discussionsUsed || 0, legacyUsage.discussionsUsed || 0),
                aiRepliesUsed: Math.max(existingUsage.aiRepliesUsed || 0, legacyUsage.aiRepliesUsed || 0),
                campaignsUsed: Math.max(existingUsage.campaignsUsed || 0, legacyUsage.campaignsUsed || 0),
                viewsUsed: Math.max(existingUsage.viewsUsed || 0, legacyUsage.viewsUsed || 0),
                resetsUsed: Math.max(existingUsage.resetsUsed || 0, legacyUsage.resetsUsed || 0),
                lastUpdated: new Date().toISOString(),
                mergedFrom: [
                  ...(existingUsage.mergedFrom || []),
                  {
                    platform: platform,
                    username: username,
                    legacyKey: item.Key,
                    mergedAt: new Date().toISOString()
                  }
                ]
              };
              
              await putJson('admin', adminKey, mergedUsage);
              console.log(`🔄 Merged ${item.Key} into existing admin/usage/${firebaseUid}/${period}.json`);
              migratedCount++;
            }
          } else {
            console.warn(`❌ No Firebase UID found for ${platformKey} (from ${item.Key})`);
            skippedCount++;
          }
          
        } catch (err) {
          console.error(`Error migrating ${item.Key}:`, err.message);
          skippedCount++;
        }
      }
    }
    
    console.log(`\n📊 Migration Summary:`);
    console.log(`✅ Migrated: ${migratedCount} usage files`);
    console.log(`⚠️ Skipped: ${skippedCount} usage files`);
    console.log(`🗂️ Platform mappings: ${platformToUidMap.size}`);
    
  } catch (error) {
    console.error('Error during usage migration:', error);
  }
}

migrateUsageData();
