import express from 'express';
import multer from 'multer';
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import axios from 'axios';
import crypto from 'crypto';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

// Import utilities from shared module
import {
  convertWebPToJPEG,
  generatePlaceholderImage,
  setCorsHeaders,
  streamToString,
  streamToBuffer,
  validateImageBuffer,
  s3Client as sharedS3Client
} from '../shared/utils.js';

// Import getFacebookTokenData from socialMedia module
import { getFacebookTokenData } from './socialMedia.js';

// Create router
const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// Use shared S3 client
const s3Client = sharedS3Client;

// Schedule Instagram post endpoint - matches our successful real-time implementation
router.post(['/api/schedule-post/:userId', '/schedule-post/:userId'], upload.single('image'), async (req, res) => {
    setCorsHeaders(res);
    
    const { userId } = req.params;
    const { caption, scheduleDate, platform = 'instagram', imageKey } = req.body;
    const file = req.file;
  
    console.log(`[${new Date().toISOString()}] Schedule post request for user ${userId}: image=${!!file}, imageKey=${imageKey}, caption=${!!caption}, scheduleDate=${scheduleDate}`);
  
    if (!caption || !scheduleDate) {
      return res.status(400).json({ error: 'Missing required fields: caption or scheduleDate' });
    }
  
    try {
      // Validate schedule date
      const scheduledTime = new Date(scheduleDate);
      const now = new Date();
      const maxFutureDate = new Date(now.getTime() + 75 * 24 * 60 * 60 * 1000); // 75 days max
  
      if (scheduledTime <= now) {
        return res.status(400).json({ error: 'Schedule date must be in the future' });
      }
  
      if (scheduledTime > maxFutureDate) {
        return res.status(400).json({ error: 'Schedule date cannot be more than 75 days in the future' });
      }
  
      // Generate unique keys for storage
      const scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      let finalImageKey = imageKey;
      let imageFormat = 'jpg';
      
      if (imageKey) {
        // Use existing image key - SIMPLIFIED approach
        console.log(`[${new Date().toISOString()}] Using existing image key: ${imageKey}`);
        
        // Verify the image exists in R2
        try {
          const existingImageKey = `ready_post/${platform}/${userId}/${imageKey}`;
          await s3Client.send(new HeadObjectCommand({
            Bucket: 'tasks',
            Key: existingImageKey
          }));
          console.log(`[${new Date().toISOString()}] ✅ Existing image verified: ${existingImageKey}`);
        } catch (error) {
          console.error(`[${new Date().toISOString()}] ❌ Existing image not found: ${imageKey}`, error.message);
          return res.status(400).json({ error: 'Image not found in storage' });
        }
      } else if (file) {
        // Process uploaded image (fallback for when imageKey is not provided)
        console.log(`[${new Date().toISOString()}] Processing uploaded image as fallback`);
        
        let imageBuffer = file.buffer;
        
        // Detect actual image format from file content (magic bytes)
        let actualFormat = 'unknown';
        let mimeType = file.mimetype;
        
        if (imageBuffer.length >= 4) {
          // Check for JPEG signature (FF D8)
          if (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) {
            actualFormat = 'jpeg';
            mimeType = 'image/jpeg';
          }
          // Check for PNG signature (89 50 4E 47)
          else if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50 && 
                   imageBuffer[2] === 0x4E && imageBuffer[3] === 0x47) {
            actualFormat = 'png';
            mimeType = 'image/png';
          }
          // Check for WebP signature (RIFF + WEBP) - Strict validation
          else if (imageBuffer.length >= 12 &&
                   imageBuffer.toString('ascii', 0, 4) === 'RIFF' &&
                   imageBuffer.toString('ascii', 8, 12) === 'WEBP') {
            actualFormat = 'webp';
            console.log(`[${new Date().toISOString()}] Valid WebP image detected in scheduled post, converting to JPEG...`);
            
            try {
              // Convert WebP to JPEG using sharp
              imageBuffer = await sharp(imageBuffer)
                .jpeg({ 
                  quality: 85, // High quality JPEG
                  progressive: true 
                })
                .toBuffer();
              
              // Update format and mimetype after conversion
              actualFormat = 'jpeg';
              mimeType = 'image/jpeg';
              
              console.log(`[${new Date().toISOString()}] WebP successfully converted to JPEG for scheduled post (${imageBuffer.length} bytes)`);
            } catch (conversionError) {
              console.error(`[${new Date().toISOString()}] WebP conversion failed for scheduled post:`, conversionError);
              
              // If it's a corrupt header error, treat as JPEG instead of failing
              if (conversionError.message.includes('corrupt header') || conversionError.message.includes('unable to parse')) {
                console.log(`[${new Date().toISOString()}] Corrupt WebP detected, treating as JPEG for scheduling`);
                actualFormat = 'jpeg';
                mimeType = 'image/jpeg';
              } else {
                return res.status(400).json({ 
                  error: 'Failed to convert WebP image to JPEG format.',
                  details: 'There was an issue converting your WebP image. Please try with a JPEG or PNG image instead.'
                });
              }
            }
          }
          // Handle RIFF format that's not WebP - treat as JPEG
          else if (imageBuffer.length >= 4 &&
                   imageBuffer.toString('ascii', 0, 4) === 'RIFF') {
            console.log(`[${new Date().toISOString()}] RIFF format detected but not WebP, treating as JPEG for scheduling`);
            actualFormat = 'jpeg';
            mimeType = 'image/jpeg';
          }
        }
        
        // Validate that we detected a supported format
        if (!['jpeg', 'png'].includes(actualFormat)) {
          return res.status(400).json({ 
            error: `Unsupported image format detected. Instagram API only supports JPEG and PNG images.`,
            details: `Detected format: ${actualFormat}. Reported mimetype: ${file.mimetype}`
          });
        }
        
        // Validate image size (Instagram requirements)
        if (imageBuffer.length > 8 * 1024 * 1024) {
          return res.status(400).json({ error: 'Image too large. Maximum file size is 8MB for Instagram posts.' });
        }
    
        // Create new image key for uploaded image
        const finalFormat = actualFormat === 'jpeg' ? 'jpg' : actualFormat;
        if (finalFormat !== actualFormat) {
          console.log(`[${new Date().toISOString()}] Renaming scheduled image extension to .${finalFormat}`);
          actualFormat = finalFormat;
        }
        finalImageKey = `scheduled_posts/${platform}/${userId}/${scheduleId}.${actualFormat}`;
        imageFormat = actualFormat;
    
        // Store uploaded image in R2
        await s3Client.send(new PutObjectCommand({
          Bucket: 'tasks',
          Key: finalImageKey,
          Body: imageBuffer,
          ContentType: mimeType,
        }));
        
        console.log(`[${new Date().toISOString()}] Uploaded image stored: ${finalImageKey}`);
      } else {
        return res.status(400).json({ error: 'Either imageKey or image file is required' });
      }
  
      // Store schedule data
      const scheduleData = {
        id: scheduleId,
        userId,
        platform,
        caption: caption.trim(),
        scheduleDate: scheduledTime.toISOString(),
        imageKey: finalImageKey,
        imageFormat: imageFormat,
        status: 'scheduled',
        createdAt: new Date().toISOString(),
        attempts: 0
      };
  
      const scheduleKey = `scheduled_posts/${platform}/${userId}/${scheduleId}.json`;
      await s3Client.send(new PutObjectCommand({
        Bucket: 'tasks',
        Key: scheduleKey,
        Body: JSON.stringify(scheduleData, null, 2),
        ContentType: 'application/json',
      }));
  
      console.log(`[${new Date().toISOString()}] Post scheduled successfully: ${scheduleId} for ${scheduledTime.toISOString()}`);
  
      res.json({ 
        success: true, 
        message: 'Post scheduled successfully!',
        scheduleId,
        scheduledFor: scheduledTime.toISOString(),
        imageFormat: imageFormat
      });
  
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error scheduling post:`, error.message);
      res.status(500).json({ 
        error: 'Failed to schedule post',
        details: error.message 
      });
    }
  });


// Schedule tweet endpoint - for future posting
router.post(['/schedule-tweet/:userId', '/api/schedule-tweet/:userId'], async (req, res) => {
    setCorsHeaders(res, req.headers.origin || '*');
    
    const { userId } = req.params;
    const { text, scheduled_time } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Tweet text is required' });
    }
    
    if (text.length > 280) {
      return res.status(400).json({ error: 'Tweet text exceeds 280 characters' });
    }
    
    if (!scheduled_time) {
      return res.status(400).json({ error: 'Scheduled time is required' });
    }
    
    const scheduledDate = new Date(scheduled_time);
    if (scheduledDate <= new Date()) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }
    
    try {
      console.log(`[${new Date().toISOString()}] Scheduling tweet for user ${userId} at ${scheduledDate.toISOString()}: "${text}"`);
      
      // Verify user has Twitter connected
      const userTokenKey = `TwitterTokens/${userId}/token.json`;
      try {
        await s3Client.send(new HeadObjectCommand({
          Bucket: 'tasks',
          Key: userTokenKey
        }));
      } catch (error) {
        if (error.name === 'NoSuchKey') {
          return res.status(404).json({ error: 'Twitter account not connected' });
        }
        throw error;
      }
      
      // Store scheduled tweet
      const scheduleId = randomUUID();
      const scheduleKey = `TwitterScheduled/${userId}/${scheduleId}.json`;
      const scheduledTweet = {
        schedule_id: scheduleId,
        user_id: userId,
        text: text.trim(),
        scheduled_time: scheduledDate.toISOString(),
        created_at: new Date().toISOString(),
        status: 'scheduled'
      };
      
      await s3Client.send(new PutObjectCommand({
        Bucket: 'tasks',
        Key: scheduleKey,
        Body: JSON.stringify(scheduledTweet, null, 2),
        ContentType: 'application/json'
      }));
      
      console.log(`[${new Date().toISOString()}] Tweet scheduled with ID ${scheduleId}`);
      
      res.json({ 
        success: true, 
        schedule_id: scheduleId,
        scheduled_time: scheduledDate.toISOString(),
        message: 'Tweet scheduled successfully' 
      });
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error scheduling tweet:`, error.message);
      res.status(500).json({ 
        error: 'Failed to schedule tweet', 
        details: error.message 
      });
    }
  });
  
  // Schedule tweet endpoint - for future posting with OAuth 2.0
  router.post(['/schedule-tweet/:userId', '/api/schedule-tweet/:userId'], async (req, res) => {
    setCorsHeaders(res, req.headers.origin || '*');
    
    const { userId } = req.params;
    const { text, scheduled_time } = req.body;
    
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Tweet text is required' });
    }
    
    if (text.length > 280) {
      return res.status(400).json({ error: 'Tweet text exceeds 280 characters' });
    }
    
    if (!scheduled_time) {
      return res.status(400).json({ error: 'Scheduled time is required' });
    }
    
    const scheduleDate = new Date(scheduled_time);
    const now = new Date();
    
    if (scheduleDate <= now) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }
    
    try {
      console.log(`[${new Date().toISOString()}] Scheduling tweet for user ${userId} at ${scheduleDate.toISOString()}: "${text}"`);
      
      // Generate unique schedule ID
      const scheduleId = crypto.randomUUID();
      
      // Store scheduled tweet in R2
      const scheduledTweetKey = `TwitterScheduled/${userId}/${scheduleId}.json`;
      const scheduledTweetData = {
        id: scheduleId,
        user_id: userId,
        text: text.trim(),
        scheduled_time: scheduleDate.toISOString(),
        created_at: new Date().toISOString(),
        status: 'pending',
        type: 'text_only'
      };
      
      await s3Client.send(new PutObjectCommand({
        Bucket: 'tasks',
        Key: scheduledTweetKey,
        Body: JSON.stringify(scheduledTweetData, null, 2),
        ContentType: 'application/json'
      }));
      
      console.log(`[${new Date().toISOString()}] Scheduled tweet stored with ID ${scheduleId}`);
      
      res.json({ 
        success: true, 
        message: 'Tweet scheduled successfully',
        schedule_id: scheduleId,
        scheduled_time: scheduleDate.toISOString()
      });
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error scheduling tweet:`, error);
      res.status(500).json({ error: 'Failed to schedule tweet' });
    }
  });
  
  // Schedule tweet with image endpoint - for future posting with OAuth 2.0 and image
  router.post(['/schedule-tweet-with-image/:userId', '/api/schedule-tweet-with-image/:userId'], upload.single('image'), async (req, res) => {
    setCorsHeaders(res, req.headers.origin || '*');
    
    const { userId } = req.params;
    
    // Debug: Log all received data
    console.log(`[${new Date().toISOString()}] POST /schedule-tweet-with-image/${userId} - Request received`);
    console.log(`[${new Date().toISOString()}] req.body:`, req.body);
    console.log(`[${new Date().toISOString()}] req.files:`, req.files ? Object.keys(req.files) : 'none');
    
    // Get fields from req.body (FormData puts text fields in req.body)
    const text = req.body.text;
    const scheduled_time = req.body.scheduled_time;
    const imageFile = req.files?.image || req.file;
    
    console.log(`[${new Date().toISOString()}] Extracted text: "${text}"`);
    console.log(`[${new Date().toISOString()}] Extracted scheduled_time: "${scheduled_time}"`);
    console.log(`[${new Date().toISOString()}] Image file present: ${!!imageFile}`);
    
    // Allow empty text if there's an image (Twitter allows image-only posts)
    if (text && text.length > 280) {
      return res.status(400).json({ error: 'Tweet text exceeds 280 characters' });
    }
    
    if (!scheduled_time) {
      return res.status(400).json({ error: 'Scheduled time is required' });
    }
    
    if (!imageFile) {
      return res.status(400).json({ error: 'Image file is required' });
    }
    
    // If no text provided, use empty string (Twitter allows image-only posts)
    const tweetText = text ? text.trim() : '';
    
    const scheduleDate = new Date(scheduled_time);
    const now = new Date();
    
    if (scheduleDate <= now) {
      return res.status(400).json({ error: 'Scheduled time must be in the future' });
    }
    
    try {
      console.log(`[${new Date().toISOString()}] Scheduling tweet with image for user ${userId} at ${scheduleDate.toISOString()}: "${tweetText}"`);
      
      // Generate unique schedule ID
      const scheduleId = crypto.randomUUID();
      
      // Store image in R2
      const imageKey = `TwitterScheduled/${userId}/${scheduleId}_image.jpg`;
      const imageBuffer = imageFile.buffer || imageFile.data;
      
      await s3Client.send(new PutObjectCommand({
        Bucket: 'tasks',
        Key: imageKey,
        Body: imageBuffer,
        ContentType: imageFile.mimetype || 'image/jpeg'
      }));
      
      // Store scheduled tweet data in R2
      const scheduledTweetKey = `TwitterScheduled/${userId}/${scheduleId}.json`;
      const scheduledTweetData = {
        id: scheduleId,
        user_id: userId,
        text: tweetText,
        scheduled_time: scheduleDate.toISOString(),
        created_at: new Date().toISOString(),
        status: 'pending',
        type: 'with_image',
        image_key: imageKey
      };
      
      await s3Client.send(new PutObjectCommand({
        Bucket: 'tasks',
        Key: scheduledTweetKey,
        Body: JSON.stringify(scheduledTweetData, null, 2),
        ContentType: 'application/json'
      }));
      
      console.log(`[${new Date().toISOString()}] Scheduled tweet with image stored with ID ${scheduleId}`);
      
      res.json({ 
        success: true, 
        message: 'Tweet with image scheduled successfully',
        schedule_id: scheduleId,
        scheduled_time: scheduleDate.toISOString()
      });
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error scheduling tweet with image:`, error);
      res.status(500).json({ error: 'Failed to schedule tweet with image' });
    }
  });
  
  // Get scheduled tweets for a user
  router.get(['/scheduled-tweets/:userId', '/api/scheduled-tweets/:userId'], async (req, res) => {
    setCorsHeaders(res, req.headers.origin || '*');
    
    const { userId } = req.params;
    
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: `TwitterScheduled/${userId}/`
      });
      
      const listResponse = await s3Client.send(listCommand);
      const files = listResponse.Contents || [];
      
      const scheduledTweets = await Promise.all(
        files.map(async (file) => {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: file.Key
            });
            const data = await s3Client.send(getCommand);
            const tweetData = JSON.parse(await streamToString(data.Body));
            
            return {
              key: file.Key,
              ...tweetData
            };
          } catch (error) {
            console.error(`Error reading scheduled tweet ${file.Key}:`, error);
            return null;
          }
        })
      );
      
      const validTweets = scheduledTweets.filter(tweet => tweet !== null);
      
      // Sort by scheduled time
      validTweets.sort((a, b) => new Date(a.scheduled_time).getTime() - new Date(b.scheduled_time).getTime());
      
      res.json(validTweets);
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error fetching scheduled tweets:`, error);
      res.status(500).json({ 
        error: 'Failed to fetch scheduled tweets', 
        details: error.message 
      });
    }
  });
  
  // Delete scheduled tweet
  router.delete(['/scheduled-tweet/:userId/:scheduleId', '/api/scheduled-tweet/:userId/:scheduleId'], async (req, res) => {
    setCorsHeaders(res, req.headers.origin || '*');
    
    const { userId, scheduleId } = req.params;
    
    try {
      const scheduleKey = `TwitterScheduled/${userId}/${scheduleId}.json`;
      
      await s3Client.send(new DeleteObjectCommand({
        Bucket: 'tasks',
        Key: scheduleKey
      }));
      
      console.log(`[${new Date().toISOString()}] Deleted scheduled tweet ${scheduleId} for user ${userId}`);
      
      res.json({ success: true, message: 'Scheduled tweet deleted' });
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error deleting scheduled tweet:`, error);
      res.status(500).json({ 
        error: 'Failed to delete scheduled tweet', 
        details: error.message 
      });
    }
  });

// Facebook scheduler worker - checks for due Facebook posts every minute
function startFacebookScheduler() {
    console.log(`[${new Date().toISOString()}] Starting Facebook scheduler...`);
    
    setInterval(async () => {
      try {
        console.log(`[${new Date().toISOString()}] Checking for due Facebook posts...`);
        
        // Get all scheduled Facebook posts
        const listCommand = new ListObjectsV2Command({
          Bucket: 'tasks',
          Prefix: 'scheduled_posts/facebook/'
        });
        
        const listResponse = await s3Client.send(listCommand);
        const files = listResponse.Contents || [];
        
        console.log(`[${new Date().toISOString()}] Found ${files.length} Facebook scheduled files in 'scheduled_posts/facebook/'`);
        
        const now = new Date();
        
        for (const file of files) {
          try {
            // Skip non-JSON files
            if (!file.Key.endsWith('.json')) continue;
            
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: file.Key
            });
            const data = await s3Client.send(getCommand);
            const scheduledPost = JSON.parse(await streamToString(data.Body));
            
            const scheduledTime = new Date(scheduledPost.scheduleDate || scheduledPost.scheduledTime);
            console.log(`[${new Date().toISOString()}] Facebook post ${scheduledPost.id}: scheduled for ${scheduledTime.toISOString()}, status: ${scheduledPost.status}, current time: ${now.toISOString()}`);
            
            // Check if post is due (within 1 minute tolerance)
            if (scheduledTime <= now && (scheduledPost.status === 'pending' || scheduledPost.status === 'scheduled')) {
              console.log(`[${new Date().toISOString()}] Processing due Facebook post: ${scheduledPost.id}`);
              
              try {
                // Get Facebook access token
                console.log(`[${new Date().toISOString()}] Looking for Facebook token for userId: ${scheduledPost.userId}`);
                const tokenData = await getFacebookTokenData(scheduledPost.userId);
                if (!tokenData) {
                  console.log(`[${new Date().toISOString()}] No Facebook token found for user ${scheduledPost.userId}`);
                  throw new Error('No Facebook token found for user');
                }
                console.log(`[${new Date().toISOString()}] Found Facebook token for page_id: ${tokenData.page_id}`);
  
                // Verify this is a business page (since we now only support Pages)
                let isBusinessPage = true;
                try {
                  const pageCheck = await axios.get(`https://graph.facebook.com/v18.0/${tokenData.page_id}`, {
                    params: {
                      fields: 'category,name,access_token',
                      access_token: tokenData.access_token
                    }
                  });
                  console.log(`[${new Date().toISOString()}] Verified Facebook Business Page: ${pageCheck.data.name} (${pageCheck.data.category || 'Business Page'})`);
                } catch (error) {
                  console.error(`[${new Date().toISOString()}] Error verifying Facebook Page:`, error.response?.data?.error?.message || error.message);
                  isBusinessPage = false;
                }
  
                if (!isBusinessPage) {
                  // Invalid Page - OAuth should have connected to a Business Page
                  // Create manual posting notification with instructions to connect proper Page
                  console.log(`[${new Date().toISOString()}] Invalid Facebook Page connection detected. Creating manual posting notification.`);
                  
                  // Update status to manual_required with instructions
                  scheduledPost.status = 'manual_required';
                  scheduledPost.manual_required_at = new Date().toISOString();
                  scheduledPost.notes = '📱 READY FOR MANUAL POSTING: Please reconnect with a Facebook Business Page for automated posting, or post manually.';
                  scheduledPost.manual_instructions = {
                    platform: 'Facebook',
                    caption: scheduledPost.caption,
                    image_url: scheduledPost.imageKey ? `https://tasks.b21d96e73b908d7d7b822d41516ccc64.r2.cloudflarestorage.com/${scheduledPost.imageKey}` : null,
                    scheduled_time: scheduledPost.scheduledDate,
                    action_required: 'Copy caption and image, then post manually to Facebook',
                    post_to: 'https://www.facebook.com'
                  };
                  
                  await s3Client.send(new PutObjectCommand({
                    Bucket: 'tasks',
                    Key: file.Key,
                    Body: JSON.stringify(scheduledPost, null, 2),
                    ContentType: 'application/json'
                  }));
                  
                  console.log(`[${new Date().toISOString()}] Facebook post ${scheduledPost.id} marked as manual_required with instructions`);
                  
                  // Broadcast real-time notification for manual posting
                  broadcastUpdate(scheduledPost.userId, {
                    event: 'manual_post_required',
                    platform: 'facebook',
                    data: {
                      postId: scheduledPost.id,
                      caption: scheduledPost.caption,
                      image_url: scheduledPost.manual_instructions.image_url,
                      scheduled_time: scheduledPost.scheduledDate,
                      message: '📱 Facebook post ready for manual posting! Please reconnect with a Business Page for automated posting.',
                      instructions: scheduledPost.manual_instructions
                    },
                    timestamp: Date.now()
                  });
                  
                  continue; // Skip to next post
                  
                } else {
                  // For business pages, proceed with normal posting
                  let postUrl = `https://graph.facebook.com/v18.0/${tokenData.page_id}/feed`;
                  let postData = { message: scheduledPost.caption };
                  let postResponse;
  
                  // If image is provided, upload it first
                  if (scheduledPost.imageKey) {
                    console.log(`[${new Date().toISOString()}] Facebook post has image, uploading...`);
                    
                    // Get the image from R2
                    const imageCommand = new GetObjectCommand({
                      Bucket: 'tasks',
                      Key: scheduledPost.imageKey
                    });
                    const imageResponse = await s3Client.send(imageCommand);
                    const imageBuffer = await streamToBuffer(imageResponse.Body);
                    
                    // Create FormData for image upload
                    const formData = new FormData();
                    formData.append('message', scheduledPost.caption || '');
                    formData.append('source', imageBuffer, {
                      filename: 'image.jpg',
                      contentType: 'image/jpeg'
                    });
  
                    // Post with image using photo endpoint
                    postUrl = `https://graph.facebook.com/v18.0/${tokenData.page_id}/photos`;
                    
                    postResponse = await axios.post(postUrl, formData, {
                      params: {
                        access_token: tokenData.access_token
                      },
                      headers: {
                        ...formData.getHeaders()
                      }
                    });
  
                    console.log(`[${new Date().toISOString()}] Facebook post with image published successfully: ${postResponse.data.id}`);
                  } else {
                    // Post text-only message
                    postResponse = await axios.post(postUrl, postData, {
                      params: {
                        access_token: tokenData.access_token
                      }
                    });
  
                    console.log(`[${new Date().toISOString()}] Facebook text post published successfully: ${postResponse.data.id}`);
                  }
                  
                  // Store the post ID for tracking
                  scheduledPost.facebook_post_id = postResponse.data.id;
                }
  
                // Update status to completed
                scheduledPost.status = 'completed';
                scheduledPost.publishedAt = new Date().toISOString();
                
                await s3Client.send(new PutObjectCommand({
                  Bucket: 'tasks',
                  Key: file.Key,
                  Body: JSON.stringify(scheduledPost, null, 2),
                  ContentType: 'application/json'
                }));
  
                console.log(`[${new Date().toISOString()}] Facebook post ${scheduledPost.id} marked as completed`);
  
              } catch (postError) {
                console.error(`[${new Date().toISOString()}] Error publishing Facebook post ${scheduledPost.id}:`, postError.message);
                
                // Update status to failed
                scheduledPost.status = 'failed';
                scheduledPost.error = postError.message;
                scheduledPost.failedAt = new Date().toISOString();
                
                await s3Client.send(new PutObjectCommand({
                  Bucket: 'tasks',
                  Key: file.Key,
                  Body: JSON.stringify(scheduledPost, null, 2),
                  ContentType: 'application/json'
                }));
              }
            }
          } catch (fileError) {
            console.error(`[${new Date().toISOString()}] Error processing Facebook scheduled file ${file.Key}:`, fileError.message);
          }
        }
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Error in Facebook scheduler:`, error.message);
      }
    }, 60000); // Check every minute
  }
  
  // Twitter scheduler worker - checks for due tweets every minute
  function startTwitterScheduler() {
    console.log(`[${new Date().toISOString()}] [SCHEDULER] Starting Twitter OAuth 2.0 scheduler...`);
    
    setInterval(async () => {
      try {
        console.log(`[${new Date().toISOString()}] [SCHEDULER] Running Twitter scheduler interval...`);
        // Get all scheduled tweets
        const listCommand = new ListObjectsV2Command({
          Bucket: 'tasks',
          Prefix: 'TwitterScheduled/'
        });
        
        const listResponse = await s3Client.send(listCommand);
        const files = listResponse.Contents || [];
        
        const now = new Date();
        
        for (const file of files) {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: file.Key
            });
            const data = await s3Client.send(getCommand);
            const scheduledTweet = JSON.parse(await streamToString(data.Body));
            
            const scheduledTime = new Date(scheduledTweet.scheduled_time);
            
            // Check if tweet is due (within 1 minute tolerance)
            if (scheduledTime <= now && scheduledTweet.status === 'scheduled') {
              console.log(`[${new Date().toISOString()}] [SCHEDULER] Processing due tweet: ${scheduledTweet.schedule_id}`);
              
              try {
                // Get user's Twitter tokens
                const userTokenKey = `TwitterTokens/${scheduledTweet.user_id}/token.json`;
                const tokenCommand = new GetObjectCommand({
                  Bucket: 'tasks',
                  Key: userTokenKey
                });
                const tokenResponse = await s3Client.send(tokenCommand);
                let tokenData = JSON.parse(await streamToString(tokenResponse.Body));
                
                // Check if token is expired and needs refresh
                if (tokenData.expires_at && new Date() > new Date(tokenData.expires_at)) {
                  console.log(`[${new Date().toISOString()}] [SCHEDULER] Scheduled tweet: Access token expired, attempting to refresh...`);
                  
                  if (tokenData.refresh_token) {
                    try {
                      // Refresh the access token
                      const refreshBody = new URLSearchParams({
                        grant_type: 'refresh_token',
                        refresh_token: tokenData.refresh_token
                      });
                      
                      // Use Basic Auth header for confidential clients
                      const basicAuthCredentials = Buffer.from(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`).toString('base64');
                      
                      const refreshResponse = await axios.post('https://api.x.com/2/oauth2/token', refreshBody, {
                        headers: {
                          'Content-Type': 'application/x-www-form-urlencoded',
                          'Accept': 'application/json',
                          'Authorization': `Basic ${basicAuthCredentials}`
                        }
                      });
                      
                      const newTokenData = refreshResponse.data;
                      
                      // Update stored token data
                      tokenData.access_token = newTokenData.access_token;
                      tokenData.refresh_token = newTokenData.refresh_token || tokenData.refresh_token;
                      tokenData.expires_in = newTokenData.expires_in || 7200;
                      tokenData.expires_at = new Date(Date.now() + (newTokenData.expires_in || 7200) * 1000).toISOString();
                      
                      // Save updated token
                      await s3Client.send(new PutObjectCommand({
                        Bucket: 'tasks',
                        Key: userTokenKey,
                        Body: JSON.stringify(tokenData, null, 2),
                        ContentType: 'application/json'
                      }));
                      
                      console.log(`[${new Date().toISOString()}] [SCHEDULER] Scheduled tweet: Access token refreshed successfully`);
                    } catch (refreshError) {
                      console.error(`[${new Date().toISOString()}] [SCHEDULER] Scheduled tweet: Token refresh failed:`, refreshError.response?.data || refreshError.message);
                      throw new Error('Token refresh failed');
                    }
                  } else {
                    throw new Error('Access token expired and no refresh token available');
                  }
                }
                
                // Post the tweet using OAuth 2.0 Bearer token
                let tweetData = { text: scheduledTweet.text };
                
                // Check if this is a tweet with image
                if (scheduledTweet.type === 'with_image' && scheduledTweet.image_key) {
                  console.log(`[${new Date().toISOString()}] [SCHEDULER] Scheduled tweet has image, uploading media first...`);
                  
                  try {
                    // Get the image from R2
                    const imageCommand = new GetObjectCommand({
                      Bucket: 'tasks',
                      Key: scheduledTweet.image_key
                    });
                    const imageResponse = await s3Client.send(imageCommand);
                    const imageBuffer = await streamToBuffer(imageResponse.Body);
                    
                    // Upload media using X API v1.1 media upload (required for chunked uploads)
                    console.log(`[${new Date().toISOString()}] [SCHEDULER] Starting chunked media upload...`);
                    
                    const totalBytes = imageBuffer.length;
                    const mediaType = 'image/jpeg';
                    
                    // Step 1: INIT - Initialize media upload
                    const initFormData = new FormData();
                    initFormData.append('command', 'INIT');
                    initFormData.append('media_type', mediaType);
                    initFormData.append('total_bytes', totalBytes.toString());
                    initFormData.append('media_category', 'tweet_image');
                    
                    const initResponse = await axios.post('https://upload.twitter.com/1.1/media/upload.json', initFormData, {
                      headers: {
                        'Authorization': `Bearer ${tokenData.access_token}`,
                        ...initFormData.getHeaders()
                      }
                    });
                    
                    const mediaId = initResponse.data.media_id_string;
                    console.log(`[${new Date().toISOString()}] [SCHEDULER] Media upload initialized: ${mediaId}`);
                    
                    // Step 2: APPEND - Upload media chunks
                    const chunkSize = 1024 * 1024; // 1MB chunks
                    let segmentIndex = 0;
                    
                    for (let i = 0; i < totalBytes; i += chunkSize) {
                      const chunk = imageBuffer.slice(i, Math.min(i + chunkSize, totalBytes));
                      
                      const appendFormData = new FormData();
                      appendFormData.append('command', 'APPEND');
                      appendFormData.append('media_id', mediaId);
                      appendFormData.append('segment_index', segmentIndex.toString());
                      appendFormData.append('media', chunk, {
                        filename: 'chunk.jpg',
                        contentType: mediaType
                      });
                      
                      await axios.post('https://upload.twitter.com/1.1/media/upload.json', appendFormData, {
                        headers: {
                          'Authorization': `Bearer ${tokenData.access_token}`,
                          ...appendFormData.getHeaders()
                        }
                      });
                      
                      console.log(`[${new Date().toISOString()}] [SCHEDULER] Uploaded chunk ${segmentIndex + 1}`);
                      segmentIndex++;
                    }
                    
                    // Step 3: FINALIZE - Complete media upload
                    const finalizeFormData = new FormData();
                    finalizeFormData.append('command', 'FINALIZE');
                    finalizeFormData.append('media_id', mediaId);
                    
                    const finalizeResponse = await axios.post('https://upload.twitter.com/1.1/media/upload.json', finalizeFormData, {
                      headers: {
                        'Authorization': `Bearer ${tokenData.access_token}`,
                        ...finalizeFormData.getHeaders()
                      }
                    });
                    
                    console.log(`[${new Date().toISOString()}] [SCHEDULER] Media upload finalized: ${mediaId}`);
                    
                    // Step 4: STATUS - Check processing status if needed
                    if (finalizeResponse.data.processing_info) {
                      console.log(`[${new Date().toISOString()}] [SCHEDULER] Media processing required, checking status...`);
                      
                      let processingComplete = false;
                      let attempts = 0;
                      const maxAttempts = 30; // 30 attempts with 2 second intervals = 1 minute max
                      
                      while (!processingComplete && attempts < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
                        
                        const statusResponse = await axios.get(`https://upload.twitter.com/1.1/media/upload.json?command=STATUS&media_id=${mediaId}`, {
                          headers: {
                            'Authorization': `Bearer ${tokenData.access_token}`
                          }
                        });
                        
                        const processingInfo = statusResponse.data.processing_info;
                        console.log(`[${new Date().toISOString()}] [SCHEDULER] Media processing status: ${processingInfo.state}`);
                        
                        if (processingInfo.state === 'succeeded') {
                          processingComplete = true;
                        } else if (processingInfo.state === 'failed') {
                          throw new Error('Media processing failed');
                        }
                        
                        attempts++;
                      }
                      
                      if (!processingComplete) {
                        throw new Error('Media processing timeout');
                      }
                    }
                    
                    console.log(`[${new Date().toISOString()}] [SCHEDULER] Scheduled tweet: Media uploaded successfully: ${mediaId}`);
                    
                    // Add media to tweet data
                    tweetData.media = { media_ids: [mediaId] };
                    
                  } catch (mediaError) {
                    console.error(`[${new Date().toISOString()}] [SCHEDULER] Error uploading media for scheduled tweet:`, mediaError.response?.data || mediaError.message);
                    throw new Error('Failed to upload media');
                  }
                }
                
                const response = await axios.post('https://api.x.com/2/tweets', tweetData, {
                  headers: {
                    'Authorization': `Bearer ${tokenData.access_token}`,
                    'Content-Type': 'application/json'
                  }
                });
                
                const tweetId = response.data.data.id;
                
                console.log(`[${new Date().toISOString()}] [SCHEDULER] Scheduled tweet posted: ${tweetId}`);
                
                // Update status to posted
                scheduledTweet.status = 'posted';
                scheduledTweet.tweet_id = tweetId;
                scheduledTweet.posted_at = new Date().toISOString();
                
                await s3Client.send(new PutObjectCommand({
                  Bucket: 'tasks',
                  Key: file.Key,
                  Body: JSON.stringify(scheduledTweet, null, 2),
                  ContentType: 'application/json'
                }));
                
                // Also store in posted tweets
                const tweetKey = `TwitterPosts/${scheduledTweet.user_id}/${tweetId}.json`;
                const tweetRecord = {
                  tweet_id: tweetId,
                  text: scheduledTweet.text,
                  user_id: scheduledTweet.user_id,
                  posted_at: scheduledTweet.posted_at,
                  scheduled: true,
                  schedule_id: scheduledTweet.schedule_id,
                  status: 'posted'
                };
                
                await s3Client.send(new PutObjectCommand({
                  Bucket: 'tasks',
                  Key: tweetKey,
                  Body: JSON.stringify(tweetRecord, null, 2),
                  ContentType: 'application/json'
                }));
                
              } catch (postError) {
                console.error(`[${new Date().toISOString()}] [SCHEDULER] Error posting scheduled tweet ${scheduledTweet.schedule_id}:`, postError.response?.data || postError.message);
                
                // Update status to failed
                scheduledTweet.status = 'failed';
                scheduledTweet.error = postError.response?.data || postError.message;
                scheduledTweet.failed_at = new Date().toISOString();
                
                await s3Client.send(new PutObjectCommand({
                  Bucket: 'tasks',
                  Key: file.Key,
                  Body: JSON.stringify(scheduledTweet, null, 2),
                  ContentType: 'application/json'
                }));
              }
            }
          } catch (error) {
            console.error(`[${new Date().toISOString()}] [SCHEDULER] Error processing scheduled tweet file ${file.Key}:`, error);
          }
        }
      } catch (error) {
        console.error(`[${new Date().toISOString()}] [SCHEDULER] Error in Twitter scheduler:`, error);
      }
    }, 60000); // Check every minute
  }
  
  // ============= INSTAGRAM POST SCHEDULER =============
  
  // Instagram scheduler worker - checks for due Instagram posts every minute  
  function startInstagramScheduler() {
    console.log(`[${new Date().toISOString()}] [SCHEDULER] Starting Instagram post scheduler...`);
    
    setInterval(async () => {
      try {
        console.log(`[${new Date().toISOString()}] [SCHEDULER] Running Instagram scheduler interval...`);
        await processScheduledInstagramPosts();
      } catch (error) {
        console.error(`[${new Date().toISOString()}] [SCHEDULER] Instagram scheduler error:`, error);
      }
    }, 60000); // Check every minute
  }
  
  async function processScheduledInstagramPosts() {
    try {
      console.log(`[${new Date().toISOString()}] [SCHEDULER] processScheduledInstagramPosts started.`);
      // List all scheduled posts
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: 'scheduled_posts/instagram/',
        MaxKeys: 100
      });
      
      const response = await s3Client.send(listCommand);
      const now = new Date();
      
      if (response.Contents) {
        for (const object of response.Contents) {
          if (!object.Key?.endsWith('.json')) continue;
          
          try {
            // Get schedule data
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: object.Key
            });
            
            const scheduleResponse = await s3Client.send(getCommand);
            const scheduleDataStr = await streamToString(scheduleResponse.Body);
            const scheduleData = JSON.parse(scheduleDataStr);
            
            // Log every scheduled post found
            console.log(`[${new Date().toISOString()}] [SCHEDULER] Found scheduled post: id=${scheduleData.id}, user=${scheduleData.userId}, status=${scheduleData.status}, scheduleDate=${scheduleData.scheduleDate}`);
            
            // Check if it's time to post
            const scheduleTime = new Date(scheduleData.scheduleDate);
            
            if (scheduleData.status === 'scheduled' && scheduleTime <= now) {
              console.log(`[${new Date().toISOString()}] [SCHEDULER] Processing due post: id=${scheduleData.id}, user=${scheduleData.userId}, scheduleDate=${scheduleData.scheduleDate}`);
              await executeScheduledPost(scheduleData);
            } else {
              console.log(`[${new Date().toISOString()}] [SCHEDULER] Skipping post: id=${scheduleData.id}, status=${scheduleData.status}, scheduleDate=${scheduleData.scheduleDate}`);
            }
            
          } catch (itemError) {
            console.error(`[${new Date().toISOString()}] [SCHEDULER] Error processing scheduled item ${object.Key}:`, itemError.message);
          }
        }
      } else {
        console.log(`[${new Date().toISOString()}] [SCHEDULER] No scheduled posts found.`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [SCHEDULER] Error in processScheduledInstagramPosts:`, error.message);
    }
  }
  
  async function executeScheduledPost(scheduleData) {
    console.log(`[${new Date().toISOString()}] [SCHEDULER] Executing scheduled post: id=${scheduleData.id}, user=${scheduleData.userId}`);
    try {
      // Update status to processing
      scheduleData.status = 'processing';
      scheduleData.attempts = (scheduleData.attempts || 0) + 1;
      scheduleData.lastAttempt = new Date().toISOString();
      
      // Save processing status
      const scheduleKey = `scheduled_posts/${scheduleData.platform}/${scheduleData.userId}/${scheduleData.id}.json`;
      await s3Client.send(new PutObjectCommand({
        Bucket: 'tasks',
        Key: scheduleKey,
        Body: JSON.stringify(scheduleData, null, 2),
        ContentType: 'application/json',
      }));
      console.log(`[${new Date().toISOString()}] [SCHEDULER] Updated status to processing for post: id=${scheduleData.id}`);
      
      // Get Instagram token data - now handles both user ID and graph ID automatically
      const tokenData = await getTokenData(scheduleData.userId);
      const { access_token, instagram_graph_id } = tokenData;
      console.log(`[${new Date().toISOString()}] [SCHEDULER] Got Instagram token for user: ${scheduleData.userId}`);
      
      // ENHANCED: Handle existing image keys properly
      console.log(`[${new Date().toISOString()}] [SCHEDULER] Fetching image: ${scheduleData.imageKey}`);
      
      // Determine the full R2 key for the image
      let fullImageKey = scheduleData.imageKey;
      
      // If the imageKey is just a filename (like "image_1.jpg"), construct the full path
      if (scheduleData.imageKey && !scheduleData.imageKey.includes('/')) {
        fullImageKey = `ready_post/${scheduleData.platform}/${scheduleData.userId}/${scheduleData.imageKey}`;
        console.log(`[${new Date().toISOString()}] [SCHEDULER] Constructed full image key: ${fullImageKey}`);
      }
      
      // SIMPLIFIED: Direct image fetch like PostCooked - no validation, no fallbacks
      console.log(`[${new Date().toISOString()}] [SCHEDULER] Fetching image directly: ${fullImageKey}`);
      
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: fullImageKey,
      });
      const response = await s3Client.send(getCommand);
      const imageBuffer = await streamToBuffer(response.Body);
      
      console.log(`[${new Date().toISOString()}] [SCHEDULER] ✅ Image fetched successfully: ${fullImageKey}, size=${imageBuffer.length}`);
      
      // Generate a signed URL for the image in R2 that will be valid for 15 minutes
      const signedUrlCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: fullImageKey
      });
      
      const signedUrl = await getSignedUrl(s3Client, signedUrlCommand, { expiresIn: 900 }); // 15 minutes
      console.log(`[${new Date().toISOString()}] [SCHEDULER] Generated signed URL for scheduled post image: ${signedUrl}`);
      
      // Upload image and create media object using Instagram API with signed URL
      const mediaResponse = await axios.post(`https://graph.instagram.com/v22.0/${instagram_graph_id}/media`, {
        image_url: signedUrl,
        caption: scheduleData.caption,
        access_token: access_token
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const mediaId = mediaResponse.data.id;
      console.log(`[${new Date().toISOString()}] [SCHEDULER] Instagram media created for scheduled post: ${mediaId}`);

      // Publish the media
      const publishResponse = await axios.post(`https://graph.instagram.com/v22.0/${instagram_graph_id}/media_publish`, {
        creation_id: mediaId,
        access_token: access_token
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const postId = publishResponse.data.id;
      console.log(`[${new Date().toISOString()}] [SCHEDULER] Scheduled Instagram post published successfully: ${postId}`);

      // Update schedule status to completed
      scheduleData.status = 'completed';
      scheduleData.completedAt = new Date().toISOString();
      scheduleData.postId = postId;
      scheduleData.mediaId = mediaId;
      
      await s3Client.send(new PutObjectCommand({
        Bucket: 'tasks',
        Key: scheduleKey,
        Body: JSON.stringify(scheduleData, null, 2),
        ContentType: 'application/json',
      }));

      // Store post record for tracking (same as real-time posting)
      const postKey = `InstagramPosts/${scheduleData.userId}/${postId}.json`;
      const postData = {
        id: postId,
        userId: scheduleData.userId,
        platform: 'instagram',
        caption: scheduleData.caption,
        media_id: mediaId,
        instagram_graph_id,
        posted_at: new Date().toISOString(),
        status: 'published',
        type: 'scheduled_post',
        schedule_id: scheduleData.id
      };

      await s3Client.send(new PutObjectCommand({
        Bucket: 'tasks',
        Key: postKey,
        Body: JSON.stringify(postData, null, 2),
        ContentType: 'application/json',
      }));

      console.log(`[${new Date().toISOString()}] [SCHEDULER] Marked post as completed: id=${scheduleData.id}`);
      console.log(`[${new Date().toISOString()}] [SCHEDULER] Scheduled post executed successfully: ${scheduleData.id} -> ${postId}`);

    } catch (error) {
      console.error(`[${new Date().toISOString()}] [SCHEDULER] Error executing scheduled post ${scheduleData.id}:`, error);
      console.error(`[${new Date().toISOString()}] [SCHEDULER] Error details for ${scheduleData.id}:`, {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
        status: error.response?.status,
        userId: scheduleData.userId,
        scheduleDate: scheduleData.scheduleDate,
        attempts: scheduleData.attempts
      });
      
      // Update status to failed if max attempts reached
      if (scheduleData.attempts >= 3) {
        scheduleData.status = 'failed';
        scheduleData.failedAt = new Date().toISOString();
        scheduleData.error = error.message || String(error);
        scheduleData.errorDetails = {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status
        };
        console.error(`[${new Date().toISOString()}] [SCHEDULER] Marked post as failed after 3 attempts: id=${scheduleData.id}`);
      } else {
        scheduleData.status = 'scheduled'; // Retry later
        console.warn(`[${new Date().toISOString()}] [SCHEDULER] Will retry post: id=${scheduleData.id}, attempt=${scheduleData.attempts}`);
      }
      
      const scheduleKey = `scheduled_posts/${scheduleData.platform}/${scheduleData.userId}/${scheduleData.id}.json`;
      await s3Client.send(new PutObjectCommand({
        Bucket: 'tasks',
        Key: scheduleKey,
        Body: JSON.stringify(scheduleData, null, 2),
        ContentType: 'application/json',
      }));
    }
  }
  
  // ============= DEBUG/UTILITY ENDPOINTS =============
  
  // Get Facebook posting capabilities (utility endpoint)
  router.get('/facebook-posting-capabilities/:userId', async (req, res) => {
    setCorsHeaders(res);
    
    const { userId } = req.params;
    
    try {
      const tokenData = await getFacebookTokenData(userId);
      if (!tokenData) {
        return res.status(404).json({ error: 'No Facebook token found' });
      }
  
      // Check if this is a personal account or business page
      let accountType = 'business_page';
      let capabilities = {
        canAutoPost: true,
        canSchedulePosts: true,
        canPostImages: true,
        canPostVideos: true,
        hasInsights: true
      };
  
      try {
        await axios.get(`https://graph.facebook.com/v18.0/${tokenData.page_id}`, {
          params: {
            fields: 'category,followers_count',
            access_token: tokenData.access_token
          }
        });
      } catch (error) {
        if (error.response?.data?.error?.message?.includes('User')) {
          accountType = 'personal_account';
          capabilities = {
            canAutoPost: false,
            canSchedulePosts: false, // Limited
            canPostImages: false, // Very limited
            canPostVideos: false,
            hasInsights: false, // Personal accounts have no insights API
            limitation: 'Personal Facebook accounts have very limited API posting capabilities. Facebook restricts automated posting for personal profiles for privacy and security reasons.',
            suggestion: 'For full automation features, consider converting to a Facebook Business Page or connecting a Facebook Business account.'
          };
        }
      }
  
      return res.json({
        accountType,
        pageId: tokenData.page_id,
        capabilities,
        connected: true
      });
  
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error checking Facebook capabilities:`, error.message);
      return res.status(500).json({ error: 'Failed to check Facebook capabilities' });
    }
  });
  
  // Test Facebook posting (utility endpoint)
  router.post('/test-facebook-post/:userId', async (req, res) => {
    setCorsHeaders(res);
    
    const { userId } = req.params;
    const { message = 'Test post from Facebook API ✨' } = req.body;
    
    try {
      // Get Facebook access token
      const tokenData = await getFacebookTokenData(userId);
      if (!tokenData) {
        return res.status(404).json({ error: 'No Facebook token found' });
      }
  
      console.log(`[${new Date().toISOString()}] Testing Facebook post for user ${userId}, page ${tokenData.page_id}`);
  
      // Try posting to Facebook
      const postResponse = await axios.post(`https://graph.facebook.com/v18.0/${tokenData.page_id}/feed`, {
        message: message
      }, {
        params: {
          access_token: tokenData.access_token
        }
      });
  
      console.log(`[${new Date().toISOString()}] Test Facebook post successful: ${postResponse.data.id}`);
      
      res.json({ 
        success: true, 
        message: 'Test Facebook post published successfully',
        post_id: postResponse.data.id,
        facebook_page_id: tokenData.page_id
      });
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error testing Facebook post:`, error.response?.data || error.message);
      res.status(500).json({ 
        error: 'Failed to test Facebook post',
        details: error.response?.data || error.message
      });
    }
  });
  
  // Get manual posting instructions endpoint
  router.get('/manual-post-instructions/:userId/:platform', async (req, res) => {
    setCorsHeaders(res);
    
    const { userId, platform } = req.params;
    
    try {
      // Get all scheduled posts requiring manual posting
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: `${platform.charAt(0).toUpperCase() + platform.slice(1)}Scheduled/`
      });
      
      const listResponse = await s3Client.send(listCommand);
      const files = listResponse.Contents || [];
      
      const manualPosts = [];
      
      for (const file of files) {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: file.Key
          });
          const data = await s3Client.send(getCommand);
          const post = JSON.parse(await streamToString(data.Body));
          
          if (post.userId === userId && post.status === 'manual_required') {
            manualPosts.push({
              postId: post.id,
              caption: post.caption,
              image_url: post.manual_instructions?.image_url,
              scheduled_time: post.scheduledDate,
              manual_required_at: post.manual_required_at,
              instructions: post.manual_instructions,
              notes: post.notes
            });
          }
        } catch (fileError) {
          console.error(`Error reading ${file.Key}:`, fileError.message);
        }
      }
      
      res.json({
        success: true,
        platform: platform,
        manual_posts: manualPosts,
        total: manualPosts.length
      });
    } catch (error) {
      console.error(`Error getting manual post instructions:`, error.message);
      res.status(500).json({ error: 'Failed to get manual posting instructions' });
    }
  });
  
  // Sync Facebook tokens with connections (utility endpoint)
  router.post('/sync-facebook-tokens/:userId', async (req, res) => {
    setCorsHeaders(res);
    
    const { userId } = req.params;
    
    try {
      // Get token data
      const tokenData = await getFacebookTokenData(userId);
      if (!tokenData) {
        return res.status(404).json({ error: 'No Facebook token found' });
      }
  
      // Update connection with real token
      const connectionKey = `FacebookConnection/${userId}/connection.json`;
      const connectionData = {
        uid: userId,
        facebook_user_id: tokenData.user_id,
        facebook_page_id: tokenData.page_id,
        username: tokenData.page_name || tokenData.user_name,
        access_token: tokenData.access_token,
        lastUpdated: new Date().toISOString()
      };
      
      const putCommand = new PutObjectCommand({
        Bucket: 'tasks',
        Key: connectionKey,
        Body: JSON.stringify(connectionData, null, 2),
        ContentType: 'application/json',
      });
      
      await s3Client.send(putCommand);
      
      res.json({ 
        success: true, 
        message: 'Facebook connection synced with token data',
        connection: {
          ...connectionData,
          access_token: connectionData.access_token.substring(0, 20) + '...' // Hide full token in response
        }
      });
    } catch (error) {
      console.error(`Error syncing Facebook tokens for ${userId}:`, error);
      res.status(500).json({ error: 'Failed to sync Facebook tokens' });
    }
  });
  
  // ============= SCHEDULER HEALTH ENDPOINTS =============
  
  // Comprehensive scheduler health endpoint for Instagram
  router.get(['/api/scheduler-health/instagram', '/scheduler-health/instagram'], async (req, res) => {
    setCorsHeaders(res);
    
    try {
      console.log(`[${new Date().toISOString()}] [HEALTH] Checking Instagram scheduler health...`);
      
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: 'scheduled_posts/instagram/',
        MaxKeys: 1000
      });
      
      const response = await s3Client.send(listCommand);
      const now = new Date();
      const posts = {
        scheduled: [],
        processing: [],
        completed: [],
        failed: [],
        overdue: []
      };
      
      if (response.Contents) {
        for (const object of response.Contents) {
          if (!object.Key?.endsWith('.json')) continue;
          
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: object.Key
            });
            
            const scheduleResponse = await s3Client.send(getCommand);
            const scheduleDataStr = await streamToString(scheduleResponse.Body);
            const scheduleData = JSON.parse(scheduleDataStr);
            
            const scheduleTime = new Date(scheduleData.scheduleDate);
            const isOverdue = scheduleTime <= now && scheduleData.status === 'scheduled';
            
            const postInfo = {
              id: scheduleData.id,
              userId: scheduleData.userId,
              status: scheduleData.status,
              scheduleDate: scheduleData.scheduleDate,
              attempts: scheduleData.attempts || 0,
              error: scheduleData.error,
              lastAttempt: scheduleData.lastAttempt,
              completedAt: scheduleData.completedAt,
              failedAt: scheduleData.failedAt,
              isOverdue
            };
            
            if (isOverdue) {
              posts.overdue.push(postInfo);
            } else {
              posts[scheduleData.status].push(postInfo);
            }
            
          } catch (error) {
            console.error(`[${new Date().toISOString()}] [HEALTH] Error reading scheduled post ${object.Key}:`, error);
          }
        }
      }
      
      const summary = {
        total: posts.scheduled.length + posts.processing.length + posts.completed.length + posts.failed.length + posts.overdue.length,
        scheduled: posts.scheduled.length,
        processing: posts.processing.length,
        completed: posts.completed.length,
        failed: posts.failed.length,
        overdue: posts.overdue.length,
        posts
      };
      
      console.log(`[${new Date().toISOString()}] [HEALTH] Instagram scheduler health:`, summary);
      res.json(summary);
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [HEALTH] Error checking scheduler health:`, error);
      res.status(500).json({ 
        error: 'Failed to check scheduler health',
        details: error.message 
      });
    }
  });
  
  // Manual retry endpoint for failed posts
  router.post(['/api/scheduler-retry/:postId', '/scheduler-retry/:postId'], async (req, res) => {
    setCorsHeaders(res);
    
    const { postId } = req.params;
    
    try {
      console.log(`[${new Date().toISOString()}] [RETRY] Manual retry requested for post: ${postId}`);
      
      // Find the failed post
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: 'scheduled_posts/instagram/',
        MaxKeys: 1000
      });
      
      const response = await s3Client.send(listCommand);
      let foundPost = null;
      let postKey = null;
      
      if (response.Contents) {
        for (const object of response.Contents) {
          if (!object.Key?.endsWith('.json')) continue;
          
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: object.Key
            });
            
            const scheduleResponse = await s3Client.send(getCommand);
            const scheduleDataStr = await streamToString(scheduleResponse.Body);
            const scheduleData = JSON.parse(scheduleDataStr);
            
            if (scheduleData.id === postId) {
              foundPost = scheduleData;
              postKey = object.Key;
              break;
            }
            
          } catch (error) {
            console.error(`[${new Date().toISOString()}] [RETRY] Error reading scheduled post ${object.Key}:`, error);
          }
        }
      }
      
      if (!foundPost) {
        return res.status(404).json({ error: 'Post not found' });
      }
      
      if (foundPost.status !== 'failed') {
        return res.status(400).json({ error: 'Post is not in failed status' });
      }
      
      // Reset the post for retry
      foundPost.status = 'scheduled';
      foundPost.attempts = 0;
      foundPost.error = null;
      foundPost.failedAt = null;
      foundPost.lastAttempt = null;
      
      // Save the reset post
      await s3Client.send(new PutObjectCommand({
        Bucket: 'tasks',
        Key: postKey,
        Body: JSON.stringify(foundPost, null, 2),
        ContentType: 'application/json',
      }));
      
      console.log(`[${new Date().toISOString()}] [RETRY] Successfully reset post for retry: ${postId}`);
      
      res.json({ 
        success: true, 
        message: 'Post reset for retry',
        postId,
        nextScheduleTime: foundPost.scheduleDate
      });
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [RETRY] Error retrying post ${postId}:`, error);
      res.status(500).json({ 
        error: 'Failed to retry post',
        details: error.message 
      });
    }
  });
  
  // Force process overdue posts endpoint
  router.post(['/api/scheduler-process-overdue', '/scheduler-process-overdue'], async (req, res) => {
    setCorsHeaders(res);
    
    try {
      console.log(`[${new Date().toISOString()}] [FORCE] Force processing overdue posts requested`);
      
      // Call the scheduler function directly
      await processScheduledInstagramPosts();
      
      res.json({ 
        success: true, 
        message: 'Overdue posts processed',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [FORCE] Error processing overdue posts:`, error);
      res.status(500).json({ 
        error: 'Failed to process overdue posts',
        details: error.message 
      });
    }
  });
  
  // Instagram post deletion endpoint
  router.delete(['/api/scheduled-post/:userId/:scheduleId', '/scheduled-post/:userId/:scheduleId'], async (req, res) => {
    setCorsHeaders(res);
    
    const { userId, scheduleId } = req.params;
    
    try {
      console.log(`[${new Date().toISOString()}] Deleting scheduled Instagram post ${scheduleId} for user ${userId}`);
      
      // Delete the schedule data
      const scheduleKey = `scheduled_posts/instagram/${userId}/${scheduleId}.json`;
      await s3Client.send(new DeleteObjectCommand({
        Bucket: 'tasks',
        Key: scheduleKey
      }));
      
      // Try to delete the associated image if it exists
      try {
        const imageKey = `scheduled_posts/instagram/${userId}/${scheduleId}.jpg`;
        await s3Client.send(new DeleteObjectCommand({
          Bucket: 'tasks',
          Key: imageKey
        }));
        console.log(`[${new Date().toISOString()}] Deleted associated image for post ${scheduleId}`);
      } catch (imageError) {
        console.log(`[${new Date().toISOString()}] No associated image found for post ${scheduleId}`);
      }
      
      console.log(`[${new Date().toISOString()}] Successfully deleted scheduled Instagram post ${scheduleId}`);
      
      res.json({ 
        success: true, 
        message: 'Scheduled Instagram post deleted successfully',
        scheduleId,
        userId
      });
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error deleting scheduled Instagram post:`, error);
      res.status(500).json({ 
        error: 'Failed to delete scheduled post',
        details: error.message 
      });
    }
  });
  
  // Twitter scheduler health endpoint
  router.get(['/api/scheduler-health/twitter', '/scheduler-health/twitter'], async (req, res) => {
    setCorsHeaders(res);
    
    try {
      console.log(`[${new Date().toISOString()}] [HEALTH] Checking Twitter scheduler health...`);
      
      // List all scheduled tweets
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: 'TwitterScheduled/',
        MaxKeys: 1000
      });
      
      const result = await s3Client.send(listCommand);
      const files = result.Contents || [];
      
      console.log(`[${new Date().toISOString()}] [HEALTH] Found ${files.length} Twitter scheduled files`);
      
      const now = new Date();
      const scheduled = [];
      const processing = [];
      const completed = [];
      const failed = [];
      const overdue = [];
      
      for (const file of files) {
        if (file.Key.endsWith('.json')) {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: file.Key
            });
            
            const data = await s3Client.send(getCommand);
            const scheduledTweet = JSON.parse(await streamToString(data.Body));
            
            const scheduledTime = new Date(scheduledTweet.scheduled_time);
            const isOverdue = scheduledTime < now && scheduledTweet.status === 'scheduled';
            
            scheduledTweet.isOverdue = isOverdue;
            
            switch (scheduledTweet.status) {
              case 'scheduled':
                if (isOverdue) {
                  overdue.push(scheduledTweet);
                } else {
                  scheduled.push(scheduledTweet);
                }
                break;
              case 'processing':
                processing.push(scheduledTweet);
                break;
              case 'completed':
                completed.push(scheduledTweet);
                break;
              case 'failed':
                failed.push(scheduledTweet);
                break;
              default:
                scheduled.push(scheduledTweet);
            }
          } catch (error) {
            console.error(`[${new Date().toISOString()}] [HEALTH] Error reading Twitter scheduled file ${file.Key}:`, error);
          }
        }
      }
      
      const healthData = {
        total: files.length,
        scheduled: scheduled.length,
        processing: processing.length,
        completed: completed.length,
        failed: failed.length,
        overdue: overdue.length,
        posts: {
          scheduled,
          processing,
          completed,
          failed,
          overdue
        }
      };
      
      console.log(`[${new Date().toISOString()}] [HEALTH] Twitter scheduler health:`, healthData);
      
      res.json(healthData);
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [HEALTH] Error checking Twitter scheduler health:`, error);
      res.status(500).json({ 
        error: 'Failed to check Twitter scheduler health',
        details: error.message 
      });
    }
  });
  
  // Facebook scheduler health endpoint
  router.get(['/api/scheduler-health/facebook', '/scheduler-health/facebook'], async (req, res) => {
    setCorsHeaders(res);
    
    try {
      console.log(`[${new Date().toISOString()}] [HEALTH] Checking Facebook scheduler health...`);
      
      // List all scheduled Facebook posts
      const listCommand = new ListObjectsV2Command({
        Bucket: 'tasks',
        Prefix: 'scheduled_posts/facebook/',
        MaxKeys: 1000
      });
      
      const result = await s3Client.send(listCommand);
      const files = result.Contents || [];
      
      console.log(`[${new Date().toISOString()}] [HEALTH] Found ${files.length} Facebook scheduled files`);
      
      const now = new Date();
      const scheduled = [];
      const processing = [];
      const completed = [];
      const failed = [];
      const overdue = [];
      
      for (const file of files) {
        if (file.Key.endsWith('.json')) {
          try {
            const getCommand = new GetObjectCommand({
              Bucket: 'tasks',
              Key: file.Key
            });
            
            const data = await s3Client.send(getCommand);
            const scheduledPost = JSON.parse(await streamToString(data.Body));
            
            const scheduledTime = new Date(scheduledPost.scheduleDate);
            const isOverdue = scheduledTime < now && scheduledPost.status === 'scheduled';
            
            scheduledPost.isOverdue = isOverdue;
            
            switch (scheduledPost.status) {
              case 'scheduled':
                if (isOverdue) {
                  overdue.push(scheduledPost);
                } else {
                  scheduled.push(scheduledPost);
                }
                break;
              case 'processing':
                processing.push(scheduledPost);
                break;
              case 'completed':
                completed.push(scheduledPost);
                break;
              case 'failed':
                failed.push(scheduledPost);
                break;
              default:
                scheduled.push(scheduledPost);
            }
          } catch (error) {
            console.error(`[${new Date().toISOString()}] [HEALTH] Error reading Facebook scheduled file ${file.Key}:`, error);
          }
        }
      }
      
      const healthData = {
        total: files.length,
        scheduled: scheduled.length,
        processing: processing.length,
        completed: completed.length,
        failed: failed.length,
        overdue: overdue.length,
        posts: {
          scheduled,
          processing,
          completed,
          failed,
          overdue
        }
      };
      
      console.log(`[${new Date().toISOString()}] [HEALTH] Facebook scheduler health:`, healthData);
      
      res.json(healthData);
      
    } catch (error) {
      console.error(`[${new Date().toISOString()}] [HEALTH] Error checking Facebook scheduler health:`, error);
      res.status(500).json({ 
        error: 'Failed to check Facebook scheduler health',
        details: error.message 
      });
    }
  });
  
  // Start the schedulers  
  startTwitterScheduler();
  startFacebookScheduler();
  startInstagramScheduler();

// Export router and scheduler functions
export default router;
export { startFacebookScheduler, startTwitterScheduler, startInstagramScheduler };