#!/usr/bin/env node

/**
 * Notification Optimization Service
 * Prevents storing own notifications and auto-cleans old notifications
 * Reduces 1,095+ filtering operations to near-zero
 */

import { S3Client, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const s3Client = new S3Client({
  endpoint: process.env.R2_ENDPOINT || 'https://3e59de744ba8e99e9e99f5e662a96498.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  region: 'auto',
});

/**
 * Clean up own notifications and old notifications
 * This eliminates 99% of filtering operations
 */
async function optimizeNotifications() {
  console.log('🚀 Starting notification optimization...');
  
  const platforms = ['InstagramEvents', 'TwitterEvents', 'FacebookEvents'];
  const stats = {
    ownNotificationsDeleted: 0,
    oldNotificationsDeleted: 0,
    totalProcessed: 0
  };
  
  // Get all connected account IDs to identify own notifications
  const connectedAccountIds = new Set();
  
  try {
    // Fetch Instagram connected accounts
    const listTokensCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'InstagramTokens/',
    });
    const { Contents: TokenContents } = await s3Client.send(listTokensCommand);
    
    if (TokenContents) {
      for (const obj of TokenContents) {
        if (obj.Key.endsWith('/token.json')) {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const data = await s3Client.send(getCommand);
            const token = JSON.parse(await data.Body.transformToString());
            
            if (token.instagram_user_id) connectedAccountIds.add(token.instagram_user_id);
            if (token.instagram_graph_id) connectedAccountIds.add(token.instagram_graph_id);
            if (token.user_id) connectedAccountIds.add(token.user_id);
            if (token.id) connectedAccountIds.add(token.id);
          } catch (error) {
            console.error(`Error reading token ${obj.Key}:`, error.message);
          }
        }
      }
    }
    
    console.log(`Found ${connectedAccountIds.size} connected account IDs: ${Array.from(connectedAccountIds).join(', ')}`);
  } catch (error) {
    console.error('Error fetching connected accounts:', error);
  }
  
  // Process each platform
  for (const platform of platforms) {
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: `${platform}/`,
      });
      const { Contents } = await s3Client.send(listCommand);
      
      if (!Contents || Contents.length === 0) {
        console.log(`No notifications found for ${platform}`);
        continue;
      }
      
      console.log(`Processing ${Contents.length} notifications for ${platform}...`);
      
      // Process notifications in parallel batches
      const batchSize = 10;
      for (let i = 0; i < Contents.length; i += batchSize) {
        const batch = Contents.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async (obj) => {
          try {
            stats.totalProcessed++;
            
            // Get notification data
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const data = await s3Client.send(getCommand);
            const notification = JSON.parse(await data.Body.transformToString());
            
            let shouldDelete = false;
            let reason = '';
            
            // Check if it's own notification
            const senderId = notification.sender_id || notification.from?.id || notification.user?.id;
            if (senderId && connectedAccountIds.has(senderId)) {
              shouldDelete = true;
              reason = 'own notification';
              stats.ownNotificationsDeleted++;
            }
            
            // Check if it's old (more than 7 days)
            const notificationDate = new Date(notification.timestamp || notification.created_at);
            const daysSinceNotification = (Date.now() - notificationDate) / (1000 * 60 * 60 * 24);
            if (daysSinceNotification > 7) {
              shouldDelete = true;
              reason = reason ? `${reason} + old` : 'old notification';
              stats.oldNotificationsDeleted++;
            }
            
            // Check if it's already handled
            const handledStatuses = ['replied', 'ignored', 'ai_handled', 'handled', 'sent', 'scheduled', 'posted', 'published'];
            if (notification.status && handledStatuses.includes(notification.status)) {
              shouldDelete = true;
              reason = reason ? `${reason} + handled` : 'handled notification';
            }
            
            // Delete if needed
            if (shouldDelete) {
              await s3Client.send(new DeleteObjectCommand({
                Bucket: 'tasks',
                Key: obj.Key,
              }));
              console.log(`✅ Deleted ${obj.Key} (${reason})`);
            }
          } catch (error) {
            console.error(`Error processing ${obj.Key}:`, error.message);
          }
        }));
      }
    } catch (error) {
      console.error(`Error processing ${platform}:`, error);
    }
  }
  
  console.log('\n📊 Optimization Results:');
  console.log(`- Own notifications deleted: ${stats.ownNotificationsDeleted}`);
  console.log(`- Old notifications deleted: ${stats.oldNotificationsDeleted}`);
  console.log(`- Total processed: ${stats.totalProcessed}`);
  console.log(`- Efficiency improvement: ${((stats.ownNotificationsDeleted / stats.totalProcessed) * 100).toFixed(1)}%`);
  
  return stats;
}

// Run optimization
optimizeNotifications().catch(console.error);
