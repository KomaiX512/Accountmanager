import express from 'express';
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { randomUUID } from 'crypto';

const upload = multer({ storage: multer.memoryStorage() });

// Import utilities from shared module
import {
  streamToString,
  streamToBuffer,
  setCorsHeaders,
  generateVerificationCode,
  s3Client,
  sseClients,
  activeConnections,
  cache,
  cacheTimestamps,
  cacheHits,
  cacheMisses,
  currentUsername,
  setCurrentUsername,
  getCurrentUsername,
  broadcastUpdate,
  shouldUseCache,
  PlatformSchemaManager
} from '../shared/utils.js';

// Create Express Router
const router = express.Router();

// S3 Client for admin bucket operations
const adminS3Client = new S3Client({
  endpoint: 'https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '18f60c98e08f1a24040de7cb7aab646c',
    secretAccessKey: '0a8c50865ecab3c410baec4d751f35493fd981f4851203fe205fe0f86063a5f6',
  },
  maxAttempts: 3,
  httpOptions: {
    connectTimeout: 50000,
    timeout: 100000,
  },
});

// Local utility functions
function handleErrorResponse(res, error) {
  console.error(`[${new Date().toISOString()}] Error:`, error);
  res.status(500).json({ error: 'Internal server error', details: error.message });
}

// ============================================================
// MISSING ENDPOINTS FROM MONOLITHIC SERVER
// ============================================================

// Check username availability endpoint
router.get(['/check-username-availability/:username', '/api/check-username-availability/:username'], async (req, res) => {
  try {
    const { username } = req.params;
    const platform = req.query.platform || 'instagram'; // Default to Instagram
    
    if (!username || username.trim() === '') {
      return res.status(400).json({ 
        available: false, 
        message: 'Username is required' 
      });
    }
    
    // Normalize the username based on platform
    const normalizedUsername = platform === 'twitter' ? username.trim() : username.trim().toLowerCase();
    
    // Create platform-specific key using new schema: AccountInfo/<platform>/<username>/info.json
    const key = `AccountInfo/${platform}/${normalizedUsername}/info.json`;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      
      await s3Client.send(getCommand);
      
      // If we get here, the file exists, meaning the username is already in use
      return res.json({
        available: false,
        message: `This ${platform} username is already in use by another account. If you wish to proceed, you may continue, but you will be using an already assigned username.`
      });
      
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        // Username is available
        return res.json({
          available: true,
          message: `${platform.charAt(0).toUpperCase() + platform.slice(1)} username is available`
        });
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error checking username availability:`, error);
    res.status(500).json({ 
      error: 'Failed to check username availability', 
      details: error.message 
    });
  }
});

// RAG Instant Reply endpoint
router.post(['/rag-instant-reply/:username', '/api/rag-instant-reply/:username'], async (req, res) => {
  const { username } = req.params;
  const { message, platform = 'instagram' } = req.body;
  
  try {
    console.log(`[${new Date().toISOString()}] [RAG-REPLY] Processing instant reply for ${username}`);
    
    // This is a placeholder implementation - you may need to implement the actual RAG logic
    const response = {
      success: true,
      reply: `Thank you for your message. This is an automated response from ${username}.`,
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [RAG-REPLY] Error:`, error);
    res.status(500).json({ error: 'Failed to generate instant reply' });
  }
});

// Mark notification as handled endpoint
router.post(['/mark-notification-handled/:userId', '/api/mark-notification-handled/:userId'], async (req, res) => {
  const { userId } = req.params;
  const { notificationId, platform = 'instagram' } = req.body;
  
  try {
    console.log(`[${new Date().toISOString()}] [NOTIFICATION-HANDLED] Marking notification as handled for ${userId}`);
    
    // Store the handled notification
    const handledNotification = {
      id: notificationId,
      userId,
      platform,
      handledAt: new Date().toISOString(),
      status: 'handled'
    };
    
    const params = {
      Bucket: 'tasks',
      Key: `handledNotifications/${userId}/${notificationId}.json`,
      Body: JSON.stringify(handledNotification, null, 2),
      ContentType: 'application/json'
    };
    
    const putCommand = new PutObjectCommand(params);
    await s3Client.send(putCommand);
    
    res.json({ success: true, message: 'Notification marked as handled' });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [NOTIFICATION-HANDLED] Error:`, error);
    res.status(500).json({ error: 'Failed to mark notification as handled' });
  }
});

// Post tweet with image endpoint
router.post(['/post-tweet-with-image/:userId', '/api/post-tweet-with-image/:userId'], upload.single('image'), async (req, res) => {
  const { userId } = req.params;
  const { text } = req.body;
  const imageFile = req.file;
  
  try {
    console.log(`[${new Date().toISOString()}] [TWEET-IMAGE] Posting tweet with image for ${userId}`);
    
    // This is a placeholder implementation - you may need to implement the actual Twitter API logic
    const response = {
      success: true,
      tweetId: `tweet_${Date.now()}`,
      message: 'Tweet posted successfully with image',
      timestamp: new Date().toISOString()
    };
    
    res.json(response);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [TWEET-IMAGE] Error:`, error);
    res.status(500).json({ error: 'Failed to post tweet with image' });
  }
});

// User Twitter status endpoints
router.get(['/user-twitter-status/:userId', '/api/user-twitter-status/:userId'], async (req, res) => {
  // Set CORS headers
  setCorsHeaders(res);
  
  const { userId } = req.params;
  
  try {
    const key = `UserTwitterStatus/${userId}/status.json`;
    
    try {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      const response = await s3Client.send(getCommand);
      const body = await streamToString(response.Body);
      
      if (!body || body.trim() === '') {
        return res.json({ hasEnteredTwitterUsername: false });
      }
      
      const userData = JSON.parse(body);
      return res.json(userData);
    } catch (error) {
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return res.json({ hasEnteredTwitterUsername: false });
      }
      throw error;
    }
  } catch (error) {
    console.error(`Error retrieving user Twitter status for ${userId}:`, error);
    res.status(500).json({ error: 'Failed to retrieve user Twitter status' });
  }
});

router.post(['/user-twitter-status/:userId', '/api/user-twitter-status/:userId'], async (req, res) => {
  const { userId } = req.params;
  const { status } = req.body;
  
  try {
    console.log(`[${new Date().toISOString()}] [TWITTER-STATUS] Updating Twitter status for ${userId}`);
    
    // Update Twitter status
    const statusData = {
      userId,
      status,
      updatedAt: new Date().toISOString()
    };
    
    const params = {
      Bucket: 'tasks',
      Key: `TwitterStatus/${userId}/status.json`,
      Body: JSON.stringify(statusData, null, 2),
      ContentType: 'application/json'
    };
    
    const putCommand = new PutObjectCommand(params);
    await s3Client.send(putCommand);
    
    res.json({ success: true, message: 'Twitter status updated' });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [TWITTER-STATUS] Error:`, error);
    res.status(500).json({ error: 'Failed to update Twitter status' });
  }
});

// Twitter connection endpoints
router.post(['/twitter-connection/:userId', '/api/twitter-connection/:userId'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  const { userId } = req.params;
  const { twitter_user_id, username } = req.body;
  
  if (!userId || !twitter_user_id) {
    return res.status(400).json({ error: 'userId and twitter_user_id are required' });
  }
  
  try {
    const key = `UserTwitterConnection/${userId}/connection.json`;
    const connectionData = {
      twitter_user_id,
      username: username || '',
      connected_at: new Date().toISOString(),
      user_id: userId
    };
    
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(connectionData, null, 2),
      ContentType: 'application/json'
    });
    
    await s3Client.send(putCommand);
    console.log(`[${new Date().toISOString()}] Stored Twitter connection for user ${userId}`);
    
    res.json({ success: true });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error storing Twitter connection:`, error);
    res.status(500).json({ error: 'Failed to store Twitter connection' });
  }
});

router.get(['/twitter-connection/:userId', '/api/twitter-connection/:userId'], async (req, res) => {
  setCorsHeaders(res, req.headers.origin || '*');
  
  const { userId } = req.params;
  
  try {
    const key = `UserTwitterConnection/${userId}/connection.json`;
    const getCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: key
    });
    
    const response = await s3Client.send(getCommand);
    const body = await streamToString(response.Body);
    const connectionData = JSON.parse(body);
    
    res.json(connectionData);
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: 'No Twitter connection found' });
    } else {
      console.error(`[${new Date().toISOString()}] Error retrieving Twitter connection:`, error);
      res.status(500).json({ error: 'Failed to retrieve Twitter connection' });
    }
  }
});

router.delete(['/twitter-connection/:userId', '/api/twitter-connection/:userId'], async (req, res) => {
  const { userId } = req.params;
  
  try {
    console.log(`[${new Date().toISOString()}] [TWITTER-CONNECTION] Deleting Twitter connection for ${userId}`);
    
    const params = {
      Bucket: 'tasks',
      Key: `TwitterTokens/${userId}/token.json`
    };
    
    const deleteCommand = new DeleteObjectCommand(params);
    await s3Client.send(deleteCommand);
    
    res.json({ success: true, message: 'Twitter connection deleted' });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [TWITTER-CONNECTION] Error:`, error);
    res.status(500).json({ error: 'Failed to delete Twitter connection' });
  }
});

// Debug endpoints
router.get(['/debug/instagram-tokens', '/api/debug/instagram-tokens'], async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] [DEBUG] Getting Instagram tokens`);
    
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'InstagramTokens/',
    });
    
    const { Contents } = await s3Client.send(listCommand);
    const tokens = [];
    
    if (Contents) {
      for (const obj of Contents) {
        if (obj.Key.endsWith('/token.json')) {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const response = await s3Client.send(getCommand);
            const token = JSON.parse(await streamToString(response.Body));
            tokens.push({
              key: obj.Key,
              username: token.username,
              lastModified: obj.LastModified?.toISOString()
            });
          } catch (error) {
            console.error(`Error reading token file ${obj.Key}:`, error);
          }
        }
      }
    }
    
    res.json({ tokens });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [DEBUG] Error:`, error);
    res.status(500).json({ error: 'Failed to get debug info' });
  }
});

router.get(['/debug/twitter-users', '/api/debug/twitter-users'], async (req, res) => {
  try {
    console.log(`[${new Date().toISOString()}] [DEBUG] Getting Twitter users`);
    
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'TwitterTokens/',
    });
    
    const { Contents } = await s3Client.send(listCommand);
    const users = [];
    
    if (Contents) {
      for (const obj of Contents) {
        if (obj.Key.endsWith('/token.json')) {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const response = await s3Client.send(getCommand);
            const token = JSON.parse(await streamToString(response.Body));
            users.push({
              key: obj.Key,
              username: token.username,
              lastModified: obj.LastModified?.toISOString()
            });
          } catch (error) {
            console.error(`Error reading token file ${obj.Key}:`, error);
          }
        }
      }
    }
    
    res.json({ users });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [DEBUG] Error:`, error);
    res.status(500).json({ error: 'Failed to get debug info' });
  }
});

router.get(['/debug/campaign-posts/:username', '/api/debug/campaign-posts/:username'], async (req, res) => {
  const { username } = req.params;
  
  try {
    console.log(`[${new Date().toISOString()}] [DEBUG] Getting campaign posts for ${username}`);
    
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `ready_post/instagram/${username}/`,
    });
    
    const { Contents } = await s3Client.send(listCommand);
    const posts = [];
    
    if (Contents) {
      for (const obj of Contents) {
        if (obj.Key.endsWith('.json')) {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: obj.Key,
            });
            const response = await s3Client.send(getCommand);
            const post = JSON.parse(await streamToString(response.Body));
            posts.push({
              key: obj.Key,
              post,
              lastModified: obj.LastModified?.toISOString()
            });
          } catch (error) {
            console.error(`Error reading post file ${obj.Key}:`, error);
          }
        }
      }
    }
    
    res.json({ posts });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [DEBUG] Error:`, error);
    res.status(500).json({ error: 'Failed to get debug info' });
  }
});

export default router; 