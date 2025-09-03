#!/usr/bin/env node

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const s3Client = new S3Client({
  endpoint: 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '7e15d4a51abb43fff3a7da4a8813044f',
    secretAccessKey: '8fccd5540c85304347cbbd25d8e1f67776a8473c73c4a8811e83d0970bd461e2',
  }
});

async function getJson(bucket, key) {
  try {
    const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return JSON.parse(await response.Body.transformToString());
  } catch (error) {
    return null;
  }
}

async function putJson(bucket, key, data) {
  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json'
    }));
    return true;
  } catch (error) {
    console.error(`Failed to save ${key}:`, error.message);
    return false;
  }
}

async function migrateUsers() {
  console.log('🚀 Starting user data migration to admin bucket...');
  
  const users = new Map(); // firebaseUID -> user data
  let migratedCount = 0;
  
  // 1. Collect Instagram connections
  console.log('\n📱 Processing Instagram connections...');
  try {
    const instagramList = await s3Client.send(new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'InstagramConnection/',
      Delimiter: '/'
    }));
    
    if (instagramList.CommonPrefixes) {
      for (const prefix of instagramList.CommonPrefixes) {
        const userPath = prefix.Prefix.replace('InstagramConnection/', '').replace('/', '');
        const connectionData = await getJson('tasks', `InstagramConnection/${userPath}/connection.json`);
        
        if (connectionData && connectionData.uid) {
          const uid = connectionData.uid;
          
          if (!users.has(uid)) {
            users.set(uid, {
              userId: uid,
              createdAt: connectionData.lastUpdated || new Date().toISOString(),
              lastLogin: connectionData.lastUpdated || new Date().toISOString()
            });
          }
          
          const user = users.get(uid);
          user.instagramUsername = connectionData.username;
          user.instagramAccountType = 'personal'; // Default since not in connection data
          user.instagramConnected = true;
          user.instagramConnectionDate = connectionData.lastUpdated;
          user.instagramUserId = connectionData.instagram_user_id;
          user.instagramGraphId = connectionData.instagram_graph_id;
          
          console.log(`  ✅ ${uid} -> Instagram: ${connectionData.username}`);
        }
      }
    }
  } catch (error) {
    console.warn('Error processing Instagram connections:', error.message);
  }
  
  // 2. Collect Facebook connections
  console.log('\n📘 Processing Facebook connections...');
  try {
    const facebookList = await s3Client.send(new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'FacebookConnection/',
      Delimiter: '/'
    }));
    
    if (facebookList.CommonPrefixes) {
      for (const prefix of facebookList.CommonPrefixes) {
        const userPath = prefix.Prefix.replace('FacebookConnection/', '').replace('/', '');
        const connectionData = await getJson('tasks', `FacebookConnection/${userPath}/connection.json`);
        
        if (connectionData && connectionData.uid) {
          const uid = connectionData.uid;
          
          if (!users.has(uid)) {
            users.set(uid, {
              userId: uid,
              createdAt: connectionData.lastUpdated || new Date().toISOString(),
              lastLogin: connectionData.lastUpdated || new Date().toISOString()
            });
          }
          
          const user = users.get(uid);
          user.facebookUsername = connectionData.username;
          user.facebookAccountType = connectionData.is_personal_account ? 'personal' : 'business';
          user.facebookConnected = true;
          user.facebookConnectionDate = connectionData.lastUpdated;
          user.facebookUserId = connectionData.facebook_user_id;
          user.facebookPageId = connectionData.facebook_page_id;
          
          console.log(`  ✅ ${uid} -> Facebook: ${connectionData.username}`);
        }
      }
    }
  } catch (error) {
    console.warn('Error processing Facebook connections:', error.message);
  }
  
  // 3. Collect Twitter connections (from tokens since no TwitterConnection directory)
  console.log('\n🐦 Processing Twitter tokens...');
  try {
    const twitterList = await s3Client.send(new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'TwitterTokens/',
      Delimiter: '/'
    }));
    
    if (twitterList.CommonPrefixes) {
      for (const prefix of twitterList.CommonPrefixes) {
        const twitterUserId = prefix.Prefix.replace('TwitterTokens/', '').replace('/', '');
        const tokenData = await getJson('tasks', `TwitterTokens/${twitterUserId}/token.json`);
        
        if (tokenData && tokenData.username) {
          // Twitter tokens don't have uid, so we need to create a mapping
          // For now, we'll use a known mapping or create a composite key
          const knownTwitterMappings = {
            'gdb': 'KUvVFxnLanYTWPuSIfphby5hxJQ2',
            'ProfFahdKhan': 'KUvVFxnLanYTWPuSIfphby5hxJQ2', 
            'Komail512': 'KUvVFxnLanYTWPuSIfphby5hxJQ2',
            'optimes6411': '94THUToVmtdKGNcq4A5cTONerxI3'
          };
          
          const uid = knownTwitterMappings[tokenData.username] || `twitter_${tokenData.username}`;
          
          if (!users.has(uid)) {
            users.set(uid, {
              userId: uid,
              createdAt: tokenData.timestamp || new Date().toISOString(),
              lastLogin: tokenData.timestamp || new Date().toISOString()
            });
          }
          
          const user = users.get(uid);
          user.twitterUsername = tokenData.username;
          user.twitterAccountType = 'personal'; // Default for Twitter
          user.twitterConnected = true;
          user.twitterConnectionDate = tokenData.timestamp;
          user.twitterUserId = tokenData.twitter_user_id;
          
          console.log(`  ✅ ${uid} -> Twitter: ${tokenData.username}`);
        }
      }
    }
  } catch (error) {
    console.warn('Error processing Twitter tokens:', error.message);
  }
  
  // 4. Also check AccountInfo for additional Firebase UIDs
  console.log('\n📋 Processing AccountInfo...');
  try {
    const platforms = ['instagram', 'facebook', 'twitter'];
    
    for (const platform of platforms) {
      const accountList = await s3Client.send(new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: `AccountInfo/${platform}/`,
        Delimiter: '/'
      }));
      
      if (accountList.CommonPrefixes) {
        for (const prefix of accountList.CommonPrefixes) {
          const username = prefix.Prefix.replace(`AccountInfo/${platform}/`, '').replace('/', '');
          const accountData = await getJson('tasks', `AccountInfo/${platform}/${username}/info.json`);
          
          if (accountData && accountData.firebaseUID) {
            const uid = accountData.firebaseUID;
            
            if (!users.has(uid)) {
              users.set(uid, {
                userId: uid,
                createdAt: accountData.createdAt || new Date().toISOString(),
                lastLogin: accountData.lastLogin || new Date().toISOString()
              });
            }
            
            const user = users.get(uid);
            const platformKey = `${platform}Username`;
            const accountTypeKey = `${platform}AccountType`;
            const connectedKey = `${platform}Connected`;
            
            if (!user[platformKey]) {
              user[platformKey] = accountData.username || username;
              user[accountTypeKey] = accountData.accountType || 'personal';
              user[connectedKey] = true;
              
              console.log(`  ✅ ${uid} -> ${platform}: ${user[platformKey]} (from AccountInfo)`);
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn('Error processing AccountInfo:', error.message);
  }
  
  // 5. Save all users to admin bucket
  console.log(`\n💾 Saving ${users.size} users to admin bucket...`);
  
  for (const [uid, userData] of users) {
    const success = await putJson('admin', `users/${uid}/data.json`, userData);
    if (success) {
      migratedCount++;
      console.log(`  ✅ Saved user: ${uid}`);
      
      // Log platform connections for this user
      const platforms = [];
      if (userData.instagramUsername) platforms.push(`Instagram: ${userData.instagramUsername}`);
      if (userData.facebookUsername) platforms.push(`Facebook: ${userData.facebookUsername}`);
      if (userData.twitterUsername) platforms.push(`Twitter: ${userData.twitterUsername}`);
      
      if (platforms.length > 0) {
        console.log(`    Platforms: ${platforms.join(', ')}`);
      }
    }
  }
  
  // 6. Create platform connection mappings in admin bucket
  console.log('\n🔗 Creating platform connection mappings...');
  
  for (const [uid, userData] of users) {
    const connections = { platformUserIds: [] };
    
    if (userData.instagramUsername) {
      connections.platformUserIds.push(`instagram_${userData.instagramUsername}`);
    }
    if (userData.facebookUsername) {
      connections.platformUserIds.push(`facebook_${userData.facebookUsername}`);
    }
    if (userData.twitterUsername) {
      connections.platformUserIds.push(`twitter_${userData.twitterUsername}`);
    }
    
    if (connections.platformUserIds.length > 0) {
      const success = await putJson('admin', `connections/firebase_uid_to_platform_users/${uid}.json`, connections);
      if (success) {
        console.log(`  ✅ Created connection mapping for ${uid}: ${connections.platformUserIds.join(', ')}`);
      }
    }
  }
  
  console.log(`\n🎉 Migration completed!`);
  console.log(`  - Total users migrated: ${migratedCount}`);
  console.log(`  - Users with Instagram: ${Array.from(users.values()).filter(u => u.instagramUsername).length}`);
  console.log(`  - Users with Facebook: ${Array.from(users.values()).filter(u => u.facebookUsername).length}`);
  console.log(`  - Users with Twitter: ${Array.from(users.values()).filter(u => u.twitterUsername).length}`);
  
  return { success: true, migratedCount, totalUsers: users.size };
}

// Run migration
migrateUsers()
  .then(result => {
    console.log('\n✅ Migration script completed successfully!');
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
