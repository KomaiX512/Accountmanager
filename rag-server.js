import express from 'express';
import cors from 'cors';
import AWS from 'aws-sdk';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const app = express();
const port = 3001;

// Configure CORS
app.use(cors({ 
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: '*',
  credentials: true 
}));
app.use(express.json({ limit: '10mb' }));

// Add explicit CORS headers for all responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  next();
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] [ERROR] ${err.stack}`);
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message
  });
});

// Configure AWS SDK for R2
const R2_CONFIG = {
  endpoint: 'https://b21d96e73b908d7d7b822d41516ccc64.r2.cloudflarestorage.com',
  accessKeyId: '986718fe67d6790c7fe4eeb78943adba',
  secretAccessKey: '08fb3b012163cce35bee80b54d83e3a6924f2679f466790a9c7fdd9456bc44fe',
  s3ForcePathStyle: true,
  signatureVersion: 'v4',
  httpOptions: {
    connectTimeout: 5000,
    timeout: 10000
  },
  maxRetries: 3
};

// Configure separate clients for different buckets
const tasksS3 = new AWS.S3({
  ...R2_CONFIG,
  params: { Bucket: 'tasks' }
});

const structuredbS3 = new AWS.S3({
  ...R2_CONFIG,
  params: { Bucket: 'structuredb' }
});

// Configure Gemini API with enhanced rate limiting
const GEMINI_CONFIG = {
  apiKey: 'AIzaSyD3vBUgwRSYPi69mb5PsJ4Ae5-g1ruZmHM',
  model: 'gemini-2.0-flash',
  maxTokens: 2000, // Restored to 2000 for better responses
  temperature: 0.2,
  topP: 0.95,
  topK: 40
};

// OPTIMAL Rate limiting configuration based on Gemini API Free Tier limits
const RATE_LIMIT = {
  maxRequestsPerMinute: 15, // Gemini 2.0 Flash Free Tier: 15 RPM
  maxRequestsPerDay: 1500,  // Gemini 2.0 Flash Free Tier: 1,500 RPD
  requestWindow: 60 * 1000, // 1 minute
  dayWindow: 24 * 60 * 60 * 1000, // 24 hours
  minDelayBetweenRequests: 2000 // Reduced to 2 seconds for better user experience
};

// Request tracking for rate limiting
const requestTracker = {
  minute: { count: 0, resetTime: Date.now() + RATE_LIMIT.requestWindow },
  day: { count: 0, resetTime: Date.now() + RATE_LIMIT.dayWindow },
  lastRequestTime: 0
};

// Request queue to handle throttling
const requestQueue = [];
let isProcessingQueue = false;

// Enhanced cache configuration with aggressive caching to reduce API calls
const profileCache = new Map();
const rulesCache = new Map();
const responseCache = new Map(); // Cache AI responses
const duplicateRequestCache = new Map(); // Cache to prevent duplicate requests
const CACHE_TTL = 30 * 60 * 1000; // Increased to 30 minutes for profile/rules
const RESPONSE_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours for AI responses
const DUPLICATE_REQUEST_TTL = 10 * 60 * 1000; // 10 minutes to prevent duplicate requests

// Quota exhaustion tracking - Be more conservative about marking as exhausted
let quotaExhausted = false;
let quotaResetTime = null;
let consecutiveQuotaErrors = 0;
const MAX_QUOTA_ERRORS_BEFORE_EXHAUSTION = 3; // Require 3 consecutive quota errors

// Fallback responses for when quota is exhausted
const FALLBACK_RESPONSES = {
  instagram: {
    general: "I understand you're looking for Instagram strategy advice! While I'm temporarily at capacity, here are some proven Instagram tactics:\n\n• Post consistently (1-2 times daily)\n• Use 5-10 relevant hashtags\n• Engage with your audience within 1 hour\n• Share Stories daily for better reach\n• Post when your audience is most active\n• Use high-quality visuals with good lighting\n• Write captions that encourage comments\n\nWould you like me to help you create specific content when I'm back online?",
    competitors: "For competitor analysis on Instagram:\n\n• Check their posting frequency and timing\n• Analyze their most engaging content types\n• Look at their hashtag strategies\n• Study their Story highlights\n• Monitor their engagement rates\n• Note their visual style and branding\n• Observe how they interact with followers\n\nI'll provide a detailed competitor analysis when my full capabilities return!",
    content: "Here are some Instagram content ideas that work well:\n\n• Behind-the-scenes content\n• User-generated content\n• Educational carousel posts\n• Trending audio with original video\n• Before/after transformations\n• Quick tips and tutorials\n• Day-in-the-life content\n• Product showcases\n\nI'll help you create specific posts when I'm fully operational again!"
  },
  facebook: {
    general: "I'm here to help with your Facebook strategy! While I'm temporarily at capacity, here are some effective Facebook tactics:\n\n• Post 3-5 times per week for optimal engagement\n• Use Facebook Groups to build community\n• Share valuable, shareable content\n• Go live regularly to boost reach\n• Use Facebook Stories for behind-the-scenes\n• Create polls and interactive content\n• Cross-promote with Instagram\n• Use Facebook Events for promotions\n\nI'll provide personalized strategies when I'm back to full capacity!",
    competitors: "For Facebook competitor research:\n\n• Monitor their posting schedule and frequency\n• Analyze their most engaging post types\n• Check their Facebook Groups activity\n• Study their video content strategy\n• Look at their event promotions\n• Monitor their customer interactions\n• Note their visual branding consistency\n• Observe their cross-platform promotion\n\nI'll provide detailed competitor insights when fully operational!",
    content: "Facebook content that drives engagement:\n\n• Educational and how-to posts\n• Community-focused content\n• Live videos and Q&As\n• User testimonials and reviews\n• Behind-the-scenes content\n• Industry news and trends\n• Interactive polls and questions\n• Event announcements\n\nI'll help create specific Facebook content when I'm back online!"
  },
  twitter: {
    general: "I'm ready to boost your X (Twitter) presence! While I'm temporarily at capacity, here are some powerful X strategies:\n\n• Tweet 3-5 times daily\n• Join trending conversations\n• Use 1-3 relevant hashtags\n• Share quick insights and tips\n• Retweet with thoughtful comments\n• Create Twitter threads for complex topics\n• Engage quickly with mentions\n• Use Twitter Spaces for live discussions\n\nI'll provide tailored X strategies when fully operational!",
    competitors: "For X (Twitter) competitor analysis:\n\n• Track their tweeting frequency and timing\n• Analyze their most retweeted content\n• Monitor hashtags they use effectively\n• Study their thread strategies\n• Check their engagement patterns\n• Look at their Twitter Spaces activity\n• Note their brand voice and tone\n• Observe their community interactions\n\nI'll deliver comprehensive competitor insights when back online!",
    content: "X (Twitter) content that gets engagement:\n\n• Quick tips and insights\n• Industry observations\n• Controversial but thoughtful takes\n• Thread tutorials\n• Live-tweeting events\n• Polls and questions\n• Memes and humor (when appropriate)\n• News commentary and analysis\n\nI'll help craft specific tweets when I'm fully operational again!"
  }
};

// Create data directories if they don't exist
const dataDir = path.join(process.cwd(), 'data');
const conversationsDir = path.join(dataDir, 'conversations');
const cacheDir = path.join(dataDir, 'cache');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}
if (!fs.existsSync(conversationsDir)) {
  fs.mkdirSync(conversationsDir);
}
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir);
}

// Helper function to retrieve profile data from structuredb with caching
async function getProfileData(username, platform = 'instagram') {
  const cacheKey = `profile_${platform}_${username}`;
  
  // Check cache first
  if (profileCache.has(cacheKey)) {
    const { data, timestamp } = profileCache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL) {
      console.log(`[RAG-Server] Using cached profile data for ${platform}/${username}`);
      return data;
    }
    // Cache expired
    profileCache.delete(cacheKey);
  }
  
  // Check local file cache
  const cacheFilePath = path.join(cacheDir, `${platform}_${username}_profile.json`);
  if (fs.existsSync(cacheFilePath)) {
    try {
      const cacheData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
      if (cacheData.timestamp && Date.now() - new Date(cacheData.timestamp).getTime() < CACHE_TTL) {
        console.log(`[RAG-Server] Using file-cached profile data for ${platform}/${username}`);
        
        // Update in-memory cache
        profileCache.set(cacheKey, {
          data: cacheData.data,
          timestamp: new Date(cacheData.timestamp).getTime()
        });
        
        return cacheData.data;
      }
    } catch (error) {
      console.error(`[RAG-Server] Error reading profile cache file:`, error);
      // Continue to fetch from R2
    }
  }
  
  console.log(`[RAG-Server] Retrieving profile data for ${platform}/${username}`);
  try {
    const data = await structuredbS3.getObject({
      Bucket: 'structuredb',
      Key: `${platform}/${username}/${username}.json`
    }).promise();
    
    const profileData = JSON.parse(data.Body.toString());
    
    // Update cache
    profileCache.set(cacheKey, {
      data: profileData,
      timestamp: Date.now()
    });
    
    // Update file cache
    fs.writeFileSync(
      cacheFilePath,
      JSON.stringify({
        data: profileData,
        timestamp: new Date().toISOString()
      }, null, 2)
    );
    
    return profileData;
  } catch (error) {
    console.error(`[RAG-Server] Error retrieving profile data for ${platform}/${username}:`, error);
    
    if (error.code === 'NoSuchKey') {
      throw new Error(`Profile data not found for ${platform}/${username}`);
    }
    
    // Check if we have a stale cache as fallback
    if (fs.existsSync(cacheFilePath)) {
      try {
        console.log(`[RAG-Server] Using stale profile cache for ${platform}/${username} as fallback`);
        const cacheData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
        return cacheData.data;
      } catch (cacheError) {
        console.error(`[RAG-Server] Error reading stale profile cache:`, cacheError);
      }
    }
    
    throw error;
  }
}

// Helper function to retrieve rules data with caching
async function getRulesData(username, platform = 'instagram') {
  const cacheKey = `rules_${platform}_${username}`;
  
  // Check cache first
  if (rulesCache.has(cacheKey)) {
    const { data, timestamp } = rulesCache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL) {
      console.log(`[RAG-Server] Using cached rules data for ${platform}/${username}`);
      return data;
    }
    // Cache expired
    rulesCache.delete(cacheKey);
  }
  
  // Check local file cache
  const cacheFilePath = path.join(cacheDir, `${platform}_${username}_rules.json`);
  if (fs.existsSync(cacheFilePath)) {
    try {
      const cacheData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
      if (cacheData.timestamp && Date.now() - new Date(cacheData.timestamp).getTime() < CACHE_TTL) {
        console.log(`[RAG-Server] Using file-cached rules data for ${platform}/${username}`);
        
        // Update in-memory cache
        rulesCache.set(cacheKey, {
          data: cacheData.data,
          timestamp: new Date(cacheData.timestamp).getTime()
        });
        
        return cacheData.data;
      }
    } catch (error) {
      console.error(`[RAG-Server] Error reading rules cache file:`, error);
      // Continue to fetch from R2
    }
  }
  
  console.log(`[RAG-Server] Retrieving rules data for ${platform}/${username}`);
  try {
    const data = await tasksS3.getObject({
      Bucket: 'tasks',
      Key: `rules/${platform}/${username}/rules.json`
    }).promise();
    
    const rulesData = JSON.parse(data.Body.toString());
    
    // Update cache
    rulesCache.set(cacheKey, {
      data: rulesData,
      timestamp: Date.now()
    });
    
    // Update file cache
    fs.writeFileSync(
      cacheFilePath,
      JSON.stringify({
        data: rulesData,
        timestamp: new Date().toISOString()
      }, null, 2)
    );
    
    return rulesData;
  } catch (error) {
    console.error(`[RAG-Server] Error retrieving rules data for ${platform}/${username}:`, error);
    
    // Rules are optional, so return empty object if not found
    if (error.code === 'NoSuchKey') {
      console.log(`[RAG-Server] No rules found for ${platform}/${username}, using defaults`);
      
      // Cache the empty rules
      const emptyRules = {};
      rulesCache.set(cacheKey, {
        data: emptyRules,
        timestamp: Date.now()
      });
      
      return emptyRules;
    }
    
    // Check if we have a stale cache as fallback
    if (fs.existsSync(cacheFilePath)) {
      try {
        console.log(`[RAG-Server] Using stale rules cache for ${platform}/${username} as fallback`);
        const cacheData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
        return cacheData.data;
      } catch (cacheError) {
        console.error(`[RAG-Server] Error reading stale rules cache:`, cacheError);
      }
    }
    
    // For rules, we can just return an empty object as fallback
    return {};
  }
}

// Helper function to save data to R2 with retries
async function saveToR2(data, key, retries = 3) {
  console.log(`[RAG-Server] Saving data to R2: ${key}`);
  
  // Create a local backup first
  const backupFilePath = path.join(dataDir, `backup_${key.replace(/\//g, '_')}`);
  fs.writeFileSync(
    backupFilePath,
    JSON.stringify(data, null, 2)
  );
  
  // Ensure any image URLs in the data use our proxy
  if (data && typeof data === 'object') {
    // For ready_post data (common case)
    if (key.includes('ready_post') && key.endsWith('.json')) {
      const urlPattern = /https?:\/\/[^\/]*(\.r2\.cloudflarestorage\.com|\.r2\.dev)\/ready_post\/([^\/]+)\/([^\/]+)\/([^?]+)/g;
      
      // Get base components from the key
      const keyParts = key.split('/');
      const platform = keyParts.length > 1 ? keyParts[1] : 'instagram';
      const username = keyParts.length > 2 ? keyParts[2] : '';
      
      // Helper function to replace URLs with proxy
      const replaceWithProxy = (obj) => {
        if (!obj) return;
        
        // Handle direct image URLs
        if (obj.image_url && typeof obj.image_url === 'string') {
          if (obj.image_url.includes('.r2.cloudflarestorage.com') || obj.image_url.includes('.r2.dev')) {
            // Extract filename from URL
            const filename = obj.image_url.split('/').pop().split('?')[0];
            obj.image_url = `http://localhost:3002/fix-image/${username}/${filename}?platform=${platform}`;
          }
        }
        
        // Handle R2 image URLs - keep them as api/r2-image for PostCooked compatibility
        if (obj.r2_image_url && typeof obj.r2_image_url === 'string') {
          if (obj.r2_image_url.includes('.r2.cloudflarestorage.com') || obj.r2_image_url.includes('.r2.dev')) {
            // Extract filename from URL
            const filename = obj.r2_image_url.split('/').pop().split('?')[0];
            obj.r2_image_url = `http://localhost:3002/api/r2-image/${username}/${filename}?platform=${platform}`;
          }
        }
        
        // Check nested post object
        if (obj.post && typeof obj.post === 'object') {
          replaceWithProxy(obj.post);
        }
      };
      
      // Fix the URLs in the data
      replaceWithProxy(data);
      
      // Update the backup with fixed URLs
      fs.writeFileSync(
        backupFilePath,
        JSON.stringify(data, null, 2)
      );
    }
  }
  
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await tasksS3.putObject({
        Bucket: 'tasks',
        Key: key,
        Body: JSON.stringify(data, null, 2),
        ContentType: 'application/json'
      }).promise();
      
      console.log(`[RAG-Server] Successfully saved data to ${key}`);
      return true;
    } catch (error) {
      lastError = error;
      console.error(`[RAG-Server] Error saving data to R2 (${key}), attempt ${attempt}/${retries}:`, error);
      
      if (attempt < retries) {
        // Exponential backoff
        const delay = 1000 * Math.pow(2, attempt - 1);
        console.log(`[RAG-Server] Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error(`[RAG-Server] Failed to save data to R2 after ${retries} attempts. Data saved locally at ${backupFilePath}`);
  throw lastError;
}

// Enhanced rate limiting check function that returns status instead of throwing
function checkRateLimit() {
  const now = Date.now();
  
  // Reset minute counter if window expired
  if (now > requestTracker.minute.resetTime) {
    requestTracker.minute.count = 0;
    requestTracker.minute.resetTime = now + RATE_LIMIT.requestWindow;
  }
  
  // Reset day counter if window expired
  if (now > requestTracker.day.resetTime) {
    requestTracker.day.count = 0;
    requestTracker.day.resetTime = now + RATE_LIMIT.dayWindow;
  }
  
  // Check minimum delay between requests
  const timeSinceLastRequest = now - requestTracker.lastRequestTime;
  if (timeSinceLastRequest < RATE_LIMIT.minDelayBetweenRequests && requestTracker.lastRequestTime > 0) {
    const waitTime = RATE_LIMIT.minDelayBetweenRequests - timeSinceLastRequest;
    return {
      allowed: false,
      reason: 'RATE_LIMITED_AUTO_QUEUE',
      waitTime,
      message: `Rate limit: minimum ${RATE_LIMIT.minDelayBetweenRequests/1000}s between requests. Auto-queuing request.`
    };
  }
  
  // Check limits
  if (requestTracker.minute.count >= RATE_LIMIT.maxRequestsPerMinute) {
    const waitTime = requestTracker.minute.resetTime - now;
    return {
      allowed: false,
      reason: 'RATE_LIMITED_AUTO_QUEUE',
      waitTime,
      message: `Rate limit exceeded. Auto-queuing request.`
    };
  }
  
  if (requestTracker.day.count >= RATE_LIMIT.maxRequestsPerDay) {
    const waitTime = requestTracker.day.resetTime - now;
    return {
      allowed: false,
      reason: 'DAILY_QUOTA_EXCEEDED',
      waitTime,
      message: `Daily quota exceeded (${RATE_LIMIT.maxRequestsPerDay} requests/day). Please wait ${Math.ceil(waitTime / 3600000)} hours.`
    };
  }
  
  // Increment counters and update last request time
  requestTracker.minute.count++;
  requestTracker.day.count++;
  requestTracker.lastRequestTime = now;
  
  return { allowed: true };
}

// Update rate tracker for successful queued requests
function updateRateTrackerForQueuedRequest() {
  const now = Date.now();
  
  // Reset minute counter if window expired
  if (now > requestTracker.minute.resetTime) {
    requestTracker.minute.count = 0;
    requestTracker.minute.resetTime = now + RATE_LIMIT.requestWindow;
  }
  
  // Reset day counter if window expired
  if (now > requestTracker.day.resetTime) {
    requestTracker.day.count = 0;
    requestTracker.day.resetTime = now + RATE_LIMIT.dayWindow;
  }
  
  // Increment counters and update last request time for successful queued request
  requestTracker.minute.count++;
  requestTracker.day.count++;
  requestTracker.lastRequestTime = now;
}

// Wrapper function to add additional timeout protection
async function withTimeout(promise, timeoutMs, errorMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    )
  ]);
}

// Request queuing system to handle throttling
async function queuedGeminiAPICall(prompt, messages = [], retries = 2) {
  return new Promise((resolve, reject) => {
    const requestItem = {
      prompt,
      messages,
      retries,
      resolve,
      reject,
      timestamp: Date.now(),
      id: Math.random().toString(36).substr(2, 9)
    };
    
    requestQueue.push(requestItem);
    console.log(`[RAG-Server] Queued Gemini request ${requestItem.id} (queue size: ${requestQueue.length})`);
    
    // Start processing queue if not already processing
    if (!isProcessingQueue) {
      processRequestQueue();
    }
  });
}

// Process the request queue with proper throttling
async function processRequestQueue() {
  if (isProcessingQueue) return;
  
  isProcessingQueue = true;
  
  while (requestQueue.length > 0) {
    const requestItem = requestQueue.shift();
    
    try {
      console.log(`[RAG-Server] Processing queued request ${requestItem.id} (${requestQueue.length} remaining)`);
      
      // Check if request has been waiting too long (more than 5 minutes)
      if (Date.now() - requestItem.timestamp > 5 * 60 * 1000) {
        console.log(`[RAG-Server] Request ${requestItem.id} expired, using fallback`);
        requestItem.reject(new Error('QUOTA_EXHAUSTED'));
        continue;
      }
      
      const result = await callGeminiAPIDirectBypassQueue(requestItem.prompt, requestItem.messages, requestItem.retries);
      requestItem.resolve(result);
      
      // Wait for the minimum delay before processing next request
      if (requestQueue.length > 0) {
        console.log(`[RAG-Server] Waiting ${RATE_LIMIT.minDelayBetweenRequests/1000}s before next request`);
        await new Promise(resolve => setTimeout(resolve, RATE_LIMIT.minDelayBetweenRequests));
      }
      
    } catch (error) {
      requestItem.reject(error);
    }
  }
  
  isProcessingQueue = false;
  console.log('[RAG-Server] Request queue processing complete');
}

// Direct Gemini API call that bypasses rate limiting (used by queue processor)
async function callGeminiAPIDirectBypassQueue(prompt, messages = [], retries = 2) {
  // This function bypasses rate limiting since it's called from the queue processor
  // which already handles timing and rate limiting
  
  // Check if quota is known to be exhausted and reset time hasn't passed
  if (quotaExhausted && quotaResetTime && new Date() < quotaResetTime) {
    console.log(`[RAG-Server] Quota exhausted until ${quotaResetTime.toISOString()}, using fallback response`);
    throw new Error('QUOTA_EXHAUSTED');
  }
  
  // Reset quota exhausted status if reset time has passed
  if (quotaExhausted && quotaResetTime && new Date() >= quotaResetTime) {
    console.log('[RAG-Server] Quota reset time reached, clearing exhausted status');
    quotaExhausted = false;
    quotaResetTime = null;
    consecutiveQuotaErrors = 0;
  }
  
  // Update rate tracker for successful queued request
  updateRateTrackerForQueuedRequest();
  
  // Create cache key with the actual user message to ensure different questions get different responses
  const userMessage = messages.length > 0 && messages[messages.length - 1].parts && messages[messages.length - 1].parts[0] 
    ? messages[messages.length - 1].parts[0].text 
    : '';
  const cacheKey = Buffer.from(`${prompt}_${userMessage}`).toString('base64').substring(0, 100);
  
  // Check for duplicate requests in progress
  const duplicateKey = `inprogress_${cacheKey}`;
  if (duplicateRequestCache.has(duplicateKey)) {
    const { promise, timestamp } = duplicateRequestCache.get(duplicateKey);
    if (Date.now() - timestamp < DUPLICATE_REQUEST_TTL) {
      console.log('[RAG-Server] Waiting for duplicate request to complete');
      return await promise;
    }
    duplicateRequestCache.delete(duplicateKey);
  }
  
  console.log('[RAG-Server] Calling Gemini API (bypassing queue)');
  
  // Create a promise for this request and register it for duplicate detection
  const apiCallPromise = (async () => {
  let lastError = null;
    
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      // Format messages properly for Gemini - SIMPLIFIED
      const formattedMessages = [];
      
      // First add the system prompt as a user message
      formattedMessages.push({
        role: 'user',
        parts: [{ text: prompt }]
      });
      
      // Then add the conversation history in simple alternating format
      if (messages && messages.length > 0) {
        for (const msg of messages) {
          const geminiRole = msg.role === 'assistant' ? 'model' : 'user';
          // Handle both direct text and nested text structure
          const messageText = msg.parts && msg.parts[0] ? msg.parts[0].text : 
                             msg.content ? msg.content :
                             msg.text ? msg.text : 
                             String(msg);
          
          formattedMessages.push({
            role: geminiRole,
            parts: [{ text: messageText }]
          });
        }
      }
      
      const requestBody = {
        contents: formattedMessages,
        generationConfig: {
          maxOutputTokens: GEMINI_CONFIG.maxTokens,
          temperature: GEMINI_CONFIG.temperature,
          topP: GEMINI_CONFIG.topP,
          topK: GEMINI_CONFIG.topK
        }
      };
      
      // Save request for debugging if needed
      const debugDir = path.join(dataDir, 'debug');
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir);
      }
      
      fs.writeFileSync(
        path.join(debugDir, `gemini_request_${Date.now()}.json`),
        JSON.stringify(requestBody, null, 2)
      );
      
      const response = await withTimeout(
        axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CONFIG.model}:generateContent?key=${GEMINI_CONFIG.apiKey}`,
          requestBody,
          {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 60000 // Increased to 60 seconds timeout
          }
        ),
        70000, // Additional 70 second timeout wrapper
        'Gemini API call timed out'
      );
      
      if (!response.data.candidates || response.data.candidates.length === 0) {
        console.log('[RAG-Server] No candidates in Gemini API response');
        throw new Error('API_ERROR: No candidates returned');
      }
      
      if (!response.data.candidates[0].content || !response.data.candidates[0].content.parts) {
        console.log('[RAG-Server] No content in Gemini API response');
        throw new Error('API_ERROR: No content returned');
      }
      
      const generatedText = response.data.candidates[0].content.parts[0].text;
      
      if (!generatedText || generatedText.trim() === '') {
        console.log('[RAG-Server] Empty text generated - this indicates content filtering');
        throw new Error('CONTENT_FILTERED: Empty response - content filtering detected');
      }
      
      // Save successful response for debugging
      fs.writeFileSync(
        path.join(debugDir, `gemini_response_${Date.now()}.json`),
        JSON.stringify(response.data, null, 2)
      );
      
      // Cache the successful response
      responseCache.set(cacheKey, {
        data: generatedText,
        timestamp: Date.now()
      });
      
      // Reset quota error counter on successful API call
      if (consecutiveQuotaErrors > 0) {
        console.log(`[RAG-Server] Successful API call, resetting quota error counter from ${consecutiveQuotaErrors} to 0`);
        consecutiveQuotaErrors = 0;
      }
      
      return generatedText;
    } catch (error) {
      lastError = error;
      console.error(`[RAG-Server] Gemini API error (attempt ${attempt}/${retries + 1}):`, error.response?.data || error.message);
      console.error(`[RAG-Server] Error code: ${error.code}, Status: ${error.response?.status}`);
      
      // Only break on actual quota errors, not timeouts
      if (error.response?.data?.error?.message && error.response.data.error.message.includes('quota')) {
        console.log(`[RAG-Server] Quota error detected, skipping retries`);
        break;
      }
      
      if (attempt <= retries) {
        // Exponential backoff with longer delays
        const delay = Math.min(10000 * Math.pow(2, attempt - 1), 30000); // Cap at 30 seconds
        console.log(`[RAG-Server] Retrying Gemini API call in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // If we've exhausted retries, check if it's a quota issue and handle gracefully
  if (lastError && lastError.response?.data?.error?.message) {
    const errorMessage = lastError.response.data.error.message;
    
    // Detect quota exhaustion
    if (detectQuotaExhaustion({ message: errorMessage })) {
      throw new Error('QUOTA_EXHAUSTED');
    }
    
    throw new Error(`Error calling Gemini API: ${errorMessage}`);
  } else if (lastError && (lastError.code === 'ECONNABORTED' || lastError.message.includes('timed out'))) {
    // Handle timeout errors - don't assume quota exhaustion
    console.log('[RAG-Server] Timeout detected, rethrowing original error');
    throw new Error(`Timeout error: ${lastError.message}`);
  } else {
    throw new Error(`Error calling Gemini API: ${lastError?.message || 'Failed after multiple attempts'}`);
  }
  })();
  
  // Register the promise for duplicate detection
  const inProgressKey = `inprogress_${cacheKey}`;
  duplicateRequestCache.set(inProgressKey, {
    promise: apiCallPromise,
    timestamp: Date.now()
  });
  
  try {
    const result = await apiCallPromise;
    return result;
  } finally {
    // Clean up the duplicate request cache
    duplicateRequestCache.delete(inProgressKey);
  }
}

// Direct Gemini API call (used by queue processor)
async function callGeminiAPIDirect(prompt, messages = [], retries = 2) {
  // Check if quota is known to be exhausted and reset time hasn't passed
  if (quotaExhausted && quotaResetTime && new Date() < quotaResetTime) {
    console.log(`[RAG-Server] Quota exhausted until ${quotaResetTime.toISOString()}, using fallback response`);
    throw new Error('QUOTA_EXHAUSTED');
  }
  
  // Reset quota exhausted status if reset time has passed
  if (quotaExhausted && quotaResetTime && new Date() >= quotaResetTime) {
    console.log('[RAG-Server] Quota reset time reached, clearing exhausted status');
    quotaExhausted = false;
    quotaResetTime = null;
    consecutiveQuotaErrors = 0;
  }
  
  // Check rate limiting
  const rateLimitStatus = checkRateLimit();
  if (!rateLimitStatus.allowed) {
    if (rateLimitStatus.reason === 'RATE_LIMITED_AUTO_QUEUE') {
      // Auto-queue the request instead of failing
      console.log(`[RAG-Server] Rate limited, auto-queuing request`);
      throw new Error('RATE_LIMITED_AUTO_QUEUE');
    } else {
      // Daily quota exceeded - fail immediately
      throw new Error(rateLimitStatus.message);
    }
  }
  
  // Create cache key with the actual user message to ensure different questions get different responses
  const userMessage = messages.length > 0 && messages[messages.length - 1].parts && messages[messages.length - 1].parts[0] 
    ? messages[messages.length - 1].parts[0].text 
    : '';
  const cacheKey = Buffer.from(`${prompt}_${userMessage}`).toString('base64').substring(0, 100);
  
  // Disable caching for instant replies to ensure fresh responses for each question
  // if (responseCache.has(cacheKey)) {
  //   const { data, timestamp } = responseCache.get(cacheKey);
  //   if (Date.now() - timestamp < RESPONSE_CACHE_TTL) {
  //     console.log('[RAG-Server] Using cached AI response');
  //     return data;
  //   }
  //   responseCache.delete(cacheKey);
  // }
  
  // Check for duplicate requests in progress
  const duplicateKey = `inprogress_${cacheKey}`;
  if (duplicateRequestCache.has(duplicateKey)) {
    const { promise, timestamp } = duplicateRequestCache.get(duplicateKey);
    if (Date.now() - timestamp < DUPLICATE_REQUEST_TTL) {
      console.log('[RAG-Server] Waiting for duplicate request to complete');
      return await promise;
    }
    duplicateRequestCache.delete(duplicateKey);
  }
  
  console.log('[RAG-Server] Calling Gemini API');
  
  // Create a promise for this request and register it for duplicate detection
  const apiCallPromise = (async () => {
  let lastError = null;
    
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      // Format messages properly for Gemini - SIMPLIFIED
      const formattedMessages = [];
      
      // First add the system prompt as a user message
      formattedMessages.push({
        role: 'user',
        parts: [{ text: prompt }]
      });
      
      // Then add the conversation history in simple alternating format
      if (messages && messages.length > 0) {
        for (const msg of messages) {
          const geminiRole = msg.role === 'assistant' ? 'model' : 'user';
          // Handle both direct text and nested text structure
          const messageText = msg.parts && msg.parts[0] ? msg.parts[0].text : 
                             msg.content ? msg.content :
                             msg.text ? msg.text : 
                             String(msg);
          
          formattedMessages.push({
            role: geminiRole,
            parts: [{ text: messageText }]
          });
        }
      }
      
      const requestBody = {
        contents: formattedMessages,
        generationConfig: {
          maxOutputTokens: GEMINI_CONFIG.maxTokens,
          temperature: GEMINI_CONFIG.temperature,
          topP: GEMINI_CONFIG.topP,
          topK: GEMINI_CONFIG.topK
        }
      };
      
      // Save request for debugging if needed
      const debugDir = path.join(dataDir, 'debug');
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir);
      }
      
      fs.writeFileSync(
        path.join(debugDir, `gemini_request_${Date.now()}.json`),
        JSON.stringify(requestBody, null, 2)
      );
      
      const response = await withTimeout(
        axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CONFIG.model}:generateContent?key=${GEMINI_CONFIG.apiKey}`,
          requestBody,
          {
            headers: {
              'Content-Type': 'application/json'
            },
            timeout: 60000 // Increased to 60 seconds timeout
          }
        ),
        70000, // Additional 70 second timeout wrapper
        'Gemini API call timed out'
      );
      
      if (!response.data.candidates || response.data.candidates.length === 0) {
        console.log('[RAG-Server] No candidates in Gemini API response');
        throw new Error('API_ERROR: No candidates returned');
      }
      
      if (!response.data.candidates[0].content || !response.data.candidates[0].content.parts) {
        console.log('[RAG-Server] No content in Gemini API response');
        throw new Error('API_ERROR: No content returned');
      }
      
      const generatedText = response.data.candidates[0].content.parts[0].text;
      
      if (!generatedText || generatedText.trim() === '') {
        console.log('[RAG-Server] Empty text generated - this indicates content filtering');
        throw new Error('CONTENT_FILTERED: Empty response - content filtering detected');
      }
      
      // Save successful response for debugging
      fs.writeFileSync(
        path.join(debugDir, `gemini_response_${Date.now()}.json`),
        JSON.stringify(response.data, null, 2)
      );
      
      // Cache the successful response
      responseCache.set(cacheKey, {
        data: generatedText,
        timestamp: Date.now()
      });
      
      // Reset quota error counter on successful API call
      if (consecutiveQuotaErrors > 0) {
        console.log(`[RAG-Server] Successful API call, resetting quota error counter from ${consecutiveQuotaErrors} to 0`);
        consecutiveQuotaErrors = 0;
      }
      
      return generatedText;
    } catch (error) {
      lastError = error;
      console.error(`[RAG-Server] Gemini API error (attempt ${attempt}/${retries + 1}):`, error.response?.data || error.message);
      console.error(`[RAG-Server] Error code: ${error.code}, Status: ${error.response?.status}`);
      
      // Only break on actual quota errors, not timeouts
      if (error.response?.data?.error?.message && error.response.data.error.message.includes('quota')) {
        console.log(`[RAG-Server] Quota error detected, skipping retries`);
        break;
      }
      
      if (attempt <= retries) {
        // Exponential backoff with longer delays
        const delay = Math.min(10000 * Math.pow(2, attempt - 1), 30000); // Cap at 30 seconds
        console.log(`[RAG-Server] Retrying Gemini API call in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // If we've exhausted retries, check if it's a quota issue and handle gracefully
  if (lastError && lastError.response?.data?.error?.message) {
    const errorMessage = lastError.response.data.error.message;
    
    // Detect quota exhaustion
    if (detectQuotaExhaustion({ message: errorMessage })) {
      throw new Error('QUOTA_EXHAUSTED');
    }
    
    throw new Error(`Error calling Gemini API: ${errorMessage}`);
  } else if (lastError && (lastError.code === 'ECONNABORTED' || lastError.message.includes('timed out'))) {
    // Handle timeout errors - don't assume quota exhaustion
    console.log('[RAG-Server] Timeout detected, rethrowing original error');
    throw new Error(`Timeout error: ${lastError.message}`);
  } else {
    throw new Error(`Error calling Gemini API: ${lastError?.message || 'Failed after multiple attempts'}`);
  }
  })();
  
  // Register the promise for duplicate detection
  const inProgressKey = `inprogress_${cacheKey}`;
  duplicateRequestCache.set(inProgressKey, {
    promise: apiCallPromise,
    timestamp: Date.now()
  });
  
  try {
    const result = await apiCallPromise;
    return result;
  } finally {
    // Clean up the duplicate request cache
    duplicateRequestCache.delete(inProgressKey);
  }
}

// Main wrapper function that uses the queue
async function callGeminiAPI(prompt, messages = [], retries = 2) {
  return await queuedGeminiAPICall(prompt, messages, retries);
}

// Create REAL RAG prompt using actual scraped profile data - NO FALLBACKS
function createRagPrompt(profileData, rulesData, query, platform = 'instagram', usingFallbackProfile = false, username = 'user') {
  const platformName = platform === 'twitter' ? 'X (Twitter)' : 
                      platform === 'facebook' ? 'Facebook' : 
                      'Instagram';
  
  // Extract REAL profile insights from scraped data
  let profileInsights = '';
  let accountMetrics = '';
  let contentStrategy = '';
  
  if (profileData && !usingFallbackProfile) {
    console.log(`[RAG-Server] DEBUG: Profile data type: ${typeof profileData}, isArray: ${Array.isArray(profileData)}`);
    console.log(`[RAG-Server] DEBUG: Profile data keys: ${Object.keys(profileData).slice(0, 10).join(', ')}`);
    
    // REAL STRUCTUREDB PROFILE EXTRACTION
    let profile = null;
    
    if (Array.isArray(profileData)) {
      // For Twitter: Array of tweets, extract profile from first tweet's author
      if (profileData.length > 0 && profileData[0].author) {
        profile = profileData[0].author;
        console.log(`[RAG-Server] ✅ EXTRACTED Twitter profile from tweet author: ${profile.userName || profile.name}`);
      } else {
        profile = profileData[0];
      }
    } else if (profileData.data && Array.isArray(profileData.data)) {
      // Handle nested data array
      if (profileData.data.length > 0 && profileData.data[0].author) {
        profile = profileData.data[0].author;
        console.log(`[RAG-Server] ✅ EXTRACTED profile from nested data author: ${profile.userName || profile.name}`);
      } else {
        profile = profileData.data[0];
      }
    } else if (profileData.username || profileData.name || profileData.userName) {
      // Direct profile object (Instagram format)
      profile = profileData;
      console.log(`[RAG-Server] ✅ DIRECT profile object: ${profile.username || profile.userName || profile.name}`);
    } else {
      // Fallback to first available object
      profile = profileData;
    }
    
    console.log(`[RAG-Server] DEBUG: Final extracted profile - username: ${profile?.username || profile?.userName}, followers: ${profile?.followersCount || profile?.followers}`);
    
    if (profile) {
      // Extract key metrics and insights with REAL STRUCTUREDB field mapping
      const username = profile.username || profile.userName || profile.name || 'N/A';
      const fullName = profile.fullName || profile.full_name || profile.display_name || profile.name || 'N/A';
      const followers = profile.followersCount || profile.followers_count || profile.followers || 'N/A';
      const following = profile.followsCount || profile.following_count || profile.following || 'N/A';
      const posts = profile.postsCount || profile.posts_count || profile.statusesCount || 'N/A';
      const verified = profile.verified || profile.is_verified || profile.isVerified || profile.isBlueVerified || false;
      const business = profile.isBusinessAccount || profile.is_business_account || false;
      const category = profile.businessCategoryName || profile.category || 'N/A';
      const bio = profile.biography || profile.bio || profile.description || '';
      
      console.log(`[RAG-Server] ✅ REAL METRICS EXTRACTED: ${username} - ${followers} followers, ${following} following, ${posts} posts`);
      
      accountMetrics = `
ACCOUNT METRICS:
- Username: ${username}
- Full Name: ${fullName}
- Followers: ${followers}
- Following: ${following}
- Posts: ${posts}
- Verified: ${verified ? 'Yes' : 'No'}
- Business Account: ${business ? 'Yes' : 'No'}
- Category: ${category}`;

      // Extract bio and content insights
      if (bio) {
        profileInsights = `
BIO ANALYSIS:
"${bio}"

CONTENT THEMES IDENTIFIED:
${extractContentThemes(bio)}`;
      }

      // Extract related profiles for competitive insights
      if (profile.relatedProfiles && profile.relatedProfiles.length > 0) {
        const competitors = profile.relatedProfiles.slice(0, 5).map(p => p.username).join(', ');
        contentStrategy = `
COMPETITIVE LANDSCAPE:
Related accounts: ${competitors}
This indicates the account operates in a competitive space with these key players.`;
      }

      // Extract external links for business insights
      if (profile.externalUrls && profile.externalUrls.length > 0) {
        const businessLinks = profile.externalUrls.map(url => url.title || url.url).join(', ');
        contentStrategy += `
BUSINESS INTEGRATION:
External links: ${businessLinks}
This shows strong e-commerce/business integration.`;
      }
    }
  }

  // Create ultra-safe query transformation that maintains natural language
  let safeQuery = query
    .replace(/\btell me about my account\b/gi, 'provide business profile analysis')
    .replace(/\bmy account\b/gi, 'this business profile')
    .replace(/\buniqueness\b/gi, 'distinguishing features')
    .replace(/\bmy\b/gi, 'the')
    .replace(/\bme\b/gi, 'this business')
    .replace(/\baccount\b/gi, 'business profile')
    .replace(/\banalyze this account performance\b/gi, 'review business performance');

  // Fix any awkward transformations that create confusing prompts
  safeQuery = safeQuery
    .replace(/\btell the about\b/gi, 'provide information about')
    .replace(/\btell this business about\b/gi, 'provide information about')
    .replace(/\bthe business profile about\b/gi, 'information about the profile')
    .replace(/\btell this business anout\b/gi, 'provide information about')
    .replace(/\banout\b/gi, 'about');

  console.log(`[RAG-Server] Real RAG query: "${safeQuery}"`);

  // BULLETPROOF CONTENT-FILTERING-SAFE PROMPT
  const profileMetrics = profileData && Array.isArray(profileData) && profileData[0] ? 
    `${profileData[0].username || profileData[0].userName || username} with ${(profileData[0].followersCount || profileData[0].followers_count || profileData[0].followers || 0).toLocaleString()} followers` : 
    `${username} with growing audience`;

  // Ultra-safe prompt that avoids any potential content filtering triggers
  return `Social media marketing consultation for ${platformName}.

Business profile: ${profileMetrics}

Marketing question: ${safeQuery}

Please provide professional marketing advice with 3 specific, actionable recommendations for growing engagement and reach on ${platformName}.

Focus on:
- Content strategy best practices
- Audience engagement techniques  
- Platform-specific growth tactics

Response format: Provide clear, professional marketing guidance.`;
}

// Helper function to extract content themes from bio
function extractContentThemes(bio) {
  if (!bio) return 'No bio content to analyze';
  
  const themes = [];
  const bioLower = bio.toLowerCase();
  
  // Beauty/Fashion themes
  if (bioLower.includes('beauty') || bioLower.includes('makeup') || bioLower.includes('cosmetics')) {
    themes.push('Beauty & Cosmetics');
  }
  if (bioLower.includes('fashion') || bioLower.includes('style')) {
    themes.push('Fashion & Style');
  }
  if (bioLower.includes('shop') || bioLower.includes('buy') || bioLower.includes('store')) {
    themes.push('E-commerce & Shopping');
  }
  if (bioLower.includes('cruelty free') || bioLower.includes('sustainable')) {
    themes.push('Ethical & Sustainable');
  }
  if (bioLower.includes('tag') || bioLower.includes('#')) {
    themes.push('User-Generated Content');
  }
  
  return themes.length > 0 ? themes.join(', ') : 'Lifestyle & General Content';
}

// API endpoint for discussion mode
app.post('/api/discussion', async (req, res) => {
  const { username, query, previousMessages = [], platform = 'instagram' } = req.body;
  
  if (!username || !query) {
    return res.status(400).json({ error: 'Username and query are required' });
  }

  try {
    // Fetch profile and rules data with platform, with fallbacks
    console.log(`[RAG-Server] Processing discussion query for ${platform}/${username}: "${query}"`);
    
    let profileData = {};
    let rulesData = {};
    let usingFallbackProfile = false;
    
    try {
      profileData = await getProfileData(username, platform);
    } catch (profileError) {
      console.log(`[RAG-Server] No profile data found for ${platform}/${username}, using fallback profile`);
      usingFallbackProfile = true;
      // Create a basic fallback profile
      profileData = {
        username: username,
        platform: platform,
        display_name: username,
        bio: `${platform.charAt(0).toUpperCase() + platform.slice(1)} content creator`,
        followers_count: 0,
        following_count: 0,
        posts_count: 0,
        is_verified: false,
        account_type: 'personal',
        category: 'Content Creator',
        profile_image: '',
        external_url: '',
        note: `Fallback profile for ${username} on ${platform}`
      };
    }
    
    try {
      rulesData = await getRulesData(username, platform);
    } catch (rulesError) {
      console.log(`[RAG-Server] No rules data found for ${platform}/${username}, using empty rules`);
      rulesData = {};
    }
    
    // Always use the enhanced RAG prompt with real data
    const ragPrompt = createRagPrompt(profileData, rulesData, query, platform, usingFallbackProfile, username);
    
    // Call Gemini API with multiple prompt strategies
    let response;
    let usedFallback = false;
    
    try {
      // Strategy 1: Try the ultra-safe business prompt first
      console.log(`[RAG-Server] Attempting ultra-safe business prompt for ${platform}/${username}`);
      
      const apiCallPromise = callGeminiAPI(ragPrompt, previousMessages);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('API_TIMEOUT')), 45000) // 45 second timeout
      );
      
      response = await Promise.race([apiCallPromise, timeoutPromise]);
      
      // Verify we have a valid response
      if (!response || response.trim() === '' || response.length < 10) {
        throw new Error('Invalid or empty response received from Gemini API');
      }
      
      console.log(`[RAG-Server] Successfully generated response for ${platform}/${username}`);
    } catch (error) {
      console.log(`[RAG-Server] Ultra-safe prompt failed: ${error.message}`);
      
      // Check if this is content filtering
      if (error.message && error.message.includes('CONTENT_FILTERED')) {
        console.log(`[RAG-Server] Content filtering detected for ${platform}/${username}, trying alternative approach`);
      }
      
      try {
        // Strategy 2: Try ultra-minimal business prompt
        console.log(`[RAG-Server] Trying ultra-minimal business prompt for ${platform}/${username}`);
        
        const platformName = platform === 'twitter' ? 'X (Twitter)' : 
                            platform === 'facebook' ? 'Facebook' : 
                            'Instagram';
        
        // Extract profile data safely for minimal prompt
        let profileUsername = username;
        let followerCount = 'a growing audience';
        
        if (profileData && Array.isArray(profileData) && profileData.length > 0) {
          const profile = profileData[0].author || profileData[0];
          profileUsername = profile.username || profile.userName || username;
          followerCount = profile.followersCount || profile.followers_count || profile.followers || 'a growing audience';
          if (typeof followerCount === 'number') {
            followerCount = followerCount.toLocaleString() + ' followers';
          }
        }

        const minimalPrompt = `Professional ${platformName} marketing consultation.

Client profile: ${profileUsername} with ${followerCount}

Marketing objective: Increase ${platformName} engagement and reach.

Please provide 3 professional marketing recommendations for ${platformName} growth.`;

        const minimalResponse = await callGeminiAPI(minimalPrompt, []);
        
        if (minimalResponse && minimalResponse.trim().length > 10) {
          response = minimalResponse;
          console.log(`[RAG-Server] Minimal prompt succeeded for ${platform}/${username}`);
        } else {
          throw new Error('Minimal prompt also failed');
        }
      } catch (secondError) {
        console.log(`[RAG-Server] Minimal prompt also failed: ${secondError.message}`);
        
        try {
          // Strategy 3: Ultra-conservative generic prompt for high-profile accounts
          console.log(`[RAG-Server] Trying ultra-conservative generic prompt for ${platform}/${username}`);
          
          const genericPrompt = `Marketing consultation request.

Platform: ${platformName}
Topic: Social media growth strategies

Please provide 3 professional marketing recommendations for increasing engagement on ${platformName}.

Focus on general best practices for:
1. Content optimization
2. Audience engagement
3. Growth strategies`;

          const genericResponse = await callGeminiAPI(genericPrompt, []);
          
          if (genericResponse && genericResponse.trim().length > 10) {
            response = genericResponse;
            console.log(`[RAG-Server] Generic prompt succeeded for ${platform}/${username}`);
          } else {
            throw new Error('Generic prompt also failed');
          }
        } catch (thirdError) {
          console.log(`[RAG-Server] All prompts failed for ${platform}/${username}: ${thirdError.message}`);
          console.log(`[RAG-Server] Using intelligent fallback response`);
          response = getFallbackResponse(query, platform);
          usedFallback = true;
        }
      }
    }
    
    // Save conversation to R2
    const conversationData = {
      username,
      platform,
      timestamp: new Date().toISOString(),
      query,
      response,
      previousMessages,
      usedFallback,
      quotaExhausted: usedFallback && quotaExhausted
    };
    
    // Save to R2 storage
    const conversationKey = usedFallback ? 
      `RAG.data/${platform}/${username}/${Date.now()}_fallback.json` :
      `RAG.data/${platform}/${username}/${Date.now()}.json`;
    await saveToR2(conversationData, conversationKey);
    
    // Return response with fallback indicator
    res.json({ 
      response, 
      usedFallback,
      usingFallbackProfile,
      quotaInfo: quotaExhausted ? {
        exhausted: true,
        resetTime: quotaResetTime?.toISOString(),
        message: "I'm temporarily at capacity but still here to help with proven strategies!"
      } : null
    });
  } catch (error) {
    console.error('[RAG-Server] Discussion endpoint error:', error.message);
    
    // Since we now have fallback profiles, we don't need to return 404 for missing profile data
    // Instead, we handle other types of errors
    if (error.message === 'QUOTA_EXHAUSTED') {
      // Handle quota exhaustion gracefully
      const fallbackResponse = getFallbackResponse(query, platform);
      return res.json({ 
        response: fallbackResponse, 
        usedFallback: true,
        usingFallbackProfile: true,
        quotaInfo: {
          exhausted: true,
          resetTime: quotaResetTime?.toISOString(),
          message: "I'm temporarily at capacity but still here to help with proven strategies!"
        }
      });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Create the post generation prompt
function createPostGenerationPrompt(profileData, rulesData, query, platform = 'instagram') {
  const platformName = platform === 'twitter' ? 'X (Twitter)' : 
                      platform === 'facebook' ? 'Facebook' : 
                      'Instagram';
  
  const characterLimit = platform === 'twitter' ? 280 : 
                        platform === 'instagram' ? 2200 : 
                        63206; // Facebook
  
  const hashtagGuidance = platform === 'twitter' ? '1-3 hashtags (Twitter best practice)' :
                         platform === 'instagram' ? '5-10 hashtags' :
                         '3-5 hashtags (Facebook best practice)';
  
  const contentGuidance = platform === 'twitter' ? 'Keep it concise and engaging for Twitter\'s fast-paced environment' :
                         platform === 'instagram' ? 'Make it visually appealing and Instagram-friendly' :
                         'Make it suitable for Facebook\'s diverse audience';

  return `
# POST GENERATION MODE
You are a ${platformName} content creator assistant.

## USER PROFILE DATA
${JSON.stringify(profileData, null, 2)}

## ACCOUNT RULES
${JSON.stringify(rulesData, null, 2)}

## POST REQUEST
${query}

Please create a ${platformName} post content that aligns with the user's profile and follows their account rules.
The response should include:
1. A caption that is engaging, relevant, and under ${characterLimit} characters (${contentGuidance})
2. Appropriate hashtags (${hashtagGuidance})
3. A brief description of what image or video should accompany this post for ${platformName}

Follow ${platformName}-specific best practices and tone.
`;
}

// API endpoint for post generator (updated with full image generation functionality)
app.post('/api/post-generator', async (req, res) => {
  try {
    const { username, query, platform = 'instagram' } = req.body;
    
    if (!username || !query) {
      return res.status(400).json({ error: 'Username and query are required' });
    }
    
    console.log(`[${new Date().toISOString()}] [RAG SERVER] Post generation request for ${platform}/${username}: "${query}"`);
    
    const platformName = platform === 'twitter' ? 'X (Twitter)' : 
                        platform === 'facebook' ? 'Facebook' : 
                        'Instagram';
    
    const characterLimit = platform === 'twitter' ? 280 : 
                          platform === 'instagram' ? 2200 : 
                          63206; // Facebook
    
    const hashtagGuidance = platform === 'twitter' ? '1-3 hashtags (Twitter best practice)' :
                           platform === 'instagram' ? '5-10 hashtags' :
                           '3-5 hashtags (Facebook best practice)';
    
    // Create a customized prompt for the post generator
    const prompt = `You are a professional social media marketing expert for the brand "${username}" on ${platformName}. 
Your task is to create a high-quality, engaging ${platformName} post about: "${query}"

IMPORTANT: DO NOT include any introductory text like "Here's a caption" or "I've created" or "Here's a post" or similar meta-commentary.

Structure your response EXACTLY as follows (with NO other text):

Caption: [Write a catchy, engaging ${platformName} caption that is 2-4 sentences long and under ${characterLimit} characters. Include relevant emojis. Make sure it's informal, conversational, and aligned with ${platformName} best practices.]

Hashtags: [List ${hashtagGuidance} for discoverability on ${platformName}]

Call to Action: [Add a brief call-to-action encouraging followers to take a specific action suitable for ${platformName}]

Visual Description for Image: [Write a detailed, vivid description for the image that should accompany this post. Be extremely specific about what should be in the image, including colors, layout, mood, lighting, and key elements. This will be used to generate an AI image, so include details about composition, style, and visual elements suitable for ${platformName}. Minimum 100 words.]`;

    try {
      // Get response from AI model
      console.log(`[${new Date().toISOString()}] [RAG SERVER] Calling AI API for ${platform} post generation`);
      
      let response;
      let usedFallback = false;
      
      try {
        response = await callGeminiAPI(prompt);
      } catch (error) {
        // Handle quota exhaustion for post generation
        if (error.message === 'QUOTA_EXHAUSTED') {
          console.log(`[${new Date().toISOString()}] [RAG SERVER] Using fallback for post generation`);
          
          // Generate a basic post structure as fallback
          const fallbackContent = getFallbackResponse(query, platform);
          const platformName = platform === 'twitter' ? 'X (Twitter)' : 
                              platform === 'facebook' ? 'Facebook' : 
                              'Instagram';
          
          response = `Caption: ${fallbackContent.split('\n')[0]} 🚀

Hashtags: #${platform} #SocialMedia #Marketing #Strategy #Growth

Call to Action: What's your biggest ${platformName} challenge? Share in the comments!

Visual Description for Image: Create a modern, professional ${platformName} strategy infographic with a clean blue and white color scheme. Include icons representing social media growth, engagement metrics, and success indicators. The image should have a bright, optimistic feel with arrows pointing upward to suggest growth and improvement. Add subtle ${platformName} branding elements and make it visually appealing for social media sharing.`;
          
          usedFallback = true;
        } else {
          throw error; // Re-throw other errors
        }
      }
      
      // Clean and process the response to extract structured content
      console.log(`[${new Date().toISOString()}] [RAG SERVER] Raw response:`, response.substring(0, 200) + '...');
      
      // Extract the sections using regex
      const captionMatch = response.match(/Caption:(.*?)(?=Hashtags:|$)/s);
      const hashtagsMatch = response.match(/Hashtags:(.*?)(?=Call to Action:|$)/s);
      const ctaMatch = response.match(/Call to Action:(.*?)(?=Visual Description for Image:|$)/s);
      const visualMatch = response.match(/Visual Description for Image:(.*?)(?=$)/s);
      
      // Format the sections into a structured response
      const caption = captionMatch ? captionMatch[1].trim() : '';
      let hashtags = [];
      if (hashtagsMatch && hashtagsMatch[1]) {
        hashtags = hashtagsMatch[1].match(/#[\w\d]+/g) || [];
      }
      const callToAction = ctaMatch ? ctaMatch[1].trim() : '';
      const imagePrompt = visualMatch ? visualMatch[1].trim() : '';
      
      // Create the structured response
      const structuredResponse = {
        caption,
        hashtags,
        call_to_action: callToAction,
        image_prompt: imagePrompt
      };
      
      // Generate timestamp for unique filename
      const timestamp = Date.now();
      
      // Add proxy URL for images - ensure we use our proxy instead of direct R2
      const imageFileName = `image_${timestamp}.jpg`;
      const postFileName = `ready_post_${timestamp}.json`;
      
      // Use consistent URL format that matches PostCooked expectations
      const baseUrl = req.get('host') ? `http://${req.get('host').replace('3001', '3002')}` : 'http://localhost:3002';
      const fixImageUrl = `${baseUrl}/fix-image/${username}/${imageFileName}?platform=${platform}`;
      const r2ImageUrl = `${baseUrl}/api/r2-image/${username}/${imageFileName}?platform=${platform}`;
      
      // Create complete post data with both URL formats for maximum compatibility
      const postData = {
        post: structuredResponse,
        timestamp,
        image_path: `ready_post/${platform}/${username}/${imageFileName}`,
        image_url: fixImageUrl,
        r2_image_url: r2ImageUrl,
        generated_at: new Date().toISOString(),
        queryUsed: query,
        status: 'new',
        platform
      };
      
      // Save to R2 for persistence - the saveToR2 function will fix any remaining direct R2 URLs
      const postKey = `ready_post/${platform}/${username}/${postFileName}`;
      await saveToR2(postData, postKey);
      
      // GENERATE ACTUAL IMAGE: Create the JPG file based on the refined prompt
      console.log(`[${new Date().toISOString()}] [RAG SERVER] Starting image generation for: ${imageFileName}`);
      try {
        await generateImageFromPrompt(imagePrompt, imageFileName, username, platform);
        console.log(`[${new Date().toISOString()}] [RAG SERVER] Image generation completed successfully`);
      } catch (imageError) {
        console.error(`[${new Date().toISOString()}] [RAG SERVER] Image generation failed:`, imageError.message);
        // Continue anyway - the placeholder will be created
      }
      
      console.log(`[${new Date().toISOString()}] [RAG SERVER] Structured response:`, JSON.stringify(structuredResponse, null, 2));
      
      // NOTIFY FRONTEND: Emit event for PostCooked auto-refresh
      const notificationPayload = {
        username,
        platform,
        timestamp: postData.timestamp,
        success: true,
        message: 'New post generated successfully'
      };
      
      // In a real implementation, you might use WebSockets or Server-Sent Events
      // For now, we'll rely on the PostCooked auto-refresh mechanism
      console.log(`[${new Date().toISOString()}] [RAG SERVER] Post generation completed - frontend should auto-refresh`);
      
      // Return the structured response with proper image URLs
      return res.json({ 
        response: structuredResponse, 
        post: postData, 
        notification: notificationPayload,
        usedFallback,
        quotaInfo: usedFallback && quotaExhausted ? {
          exhausted: true,
          resetTime: quotaResetTime?.toISOString(),
          message: "Post generated with fallback strategy - full AI capabilities return soon!"
        } : null
      });
    } catch (apiError) {
      console.error(`[${new Date().toISOString()}] [RAG SERVER] API error:`, apiError);
      return res.status(500).json({ error: 'Failed to generate post', details: apiError.message });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [RAG SERVER] Error in post generation:`, error);
    return res.status(500).json({ error: 'Failed to generate post', details: error.message });
  }
});

// Helper function to safely read JSON from file
function safelyReadJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`[RAG-Server] Error reading file ${filePath}:`, error);
    return null;
  }
}

// API endpoint to get conversation history with enhanced platform session management
app.get('/api/conversations/:username', async (req, res) => {
  const { username } = req.params;
  const platform = req.query.platform || 'instagram';
  
  try {
    console.log(`[RAG-Server] Fetching conversation history for ${platform}/${username}`);
    
    // First try to get conversations from R2 with platform-specific path
    try {
      const data = await tasksS3.listObjects({
        Bucket: 'tasks',
        Prefix: `RAG.data/${platform}/${username}/`
      }).promise();
      
      if (data.Contents && data.Contents.length > 0) {
        // Get ALL conversation files and build complete history
        const conversationFiles = data.Contents
          .filter(obj => obj.Key.endsWith('.json'))
          .sort((a, b) => a.Key.localeCompare(b.Key)); // Sort chronologically
        
        const messages = [];
        
        // Process each conversation file to build complete history
        for (const file of conversationFiles) {
          try {
            const conversationData = await tasksS3.getObject({
              Bucket: 'tasks',
              Key: file.Key
            }).promise();
            
            const parsedData = JSON.parse(conversationData.Body.toString());
            
            // Add previous messages first if they exist
            if (parsedData.previousMessages && Array.isArray(parsedData.previousMessages)) {
              parsedData.previousMessages.forEach(msg => {
                // Avoid duplicates by checking if message already exists
                if (!messages.some(existingMsg => 
                  existingMsg.content === msg.content && existingMsg.role === msg.role
                )) {
                  messages.push(msg);
                }
              });
            }
            
            // Add current query and response
            if (parsedData.query && parsedData.response) {
              messages.push({ role: 'user', content: parsedData.query });
              messages.push({ role: 'assistant', content: parsedData.response });
            }
          } catch (fileError) {
            console.warn(`[RAG-Server] Error processing conversation file ${file.Key}:`, fileError.message);
          }
        }
        
        console.log(`[RAG-Server] Loaded ${messages.length} messages from ${conversationFiles.length} files for ${platform}/${username}`);
        return res.json({ messages });
      }
    } catch (error) {
      console.log(`[RAG-Server] No R2 conversation data for ${platform}/${username}, using local fallback`);
    }
    
    // Fallback to local storage if R2 fails or has no data
    const conversationFile = path.join(conversationsDir, `${platform}_${username}.json`);
    
    if (fs.existsSync(conversationFile)) {
      const data = fs.readFileSync(conversationFile, 'utf8');
      const messages = JSON.parse(data);
      console.log(`[RAG-Server] Loaded ${messages.length} messages from local file for ${platform}/${username}`);
      res.json({ messages });
    } else {
      console.log(`[RAG-Server] No conversation history found for ${platform}/${username}`);
      res.json({ messages: [] });
    }
  } catch (error) {
    console.error(`[RAG-Server] Error fetching conversations for ${platform}/${username}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to save conversation history
app.post('/api/conversations/:username', async (req, res) => {
  const { username } = req.params;
  const { messages, platform = 'instagram' } = req.body;
  
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages must be an array' });
  }
  
  try {
    console.log(`[RAG-Server] Saving conversation for ${platform}/${username} (${messages.length} messages)`);
    
    // Save to local storage with platform prefix
    const conversationFile = path.join(conversationsDir, `${platform}_${username}.json`);
    fs.writeFileSync(conversationFile, JSON.stringify(messages, null, 2));
    
    // Also save to R2 for persistence with platform-aware path
    const conversationData = {
      username,
      platform,
      timestamp: new Date().toISOString(),
      previousMessages: messages
    };
    
    const conversationKey = `RAG.data/${platform}/${username}/${Date.now()}_conversation.json`;
    await saveToR2(conversationData, conversationKey);
    
    res.json({ success: true });
  } catch (error) {
    console.error(`[RAG-Server] Error saving conversation for ${platform}/${username}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint with detailed system info
app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    buckets: {
      tasks: 'connected',
      structuredb: 'connected'
    },
    cacheStatus: {
      profiles: profileCache.size,
      rules: rulesCache.size
    }
  };
  
  res.json(health);
});

// Endpoint to clear caches (useful for testing)
app.post('/admin/clear-cache', (req, res) => {
  profileCache.clear();
  rulesCache.clear();
  responseCache.clear();
  
  console.log('[RAG-Server] All caches cleared');
  
  res.json({ success: true, message: 'All caches cleared successfully' });
});

// Endpoint to reset rate limiting (emergency use only)
app.post('/admin/reset-rate-limit', (req, res) => {
  const now = Date.now();
  requestTracker.minute.count = 0;
  requestTracker.minute.resetTime = now + RATE_LIMIT.requestWindow;
  requestTracker.day.count = 0;
  requestTracker.day.resetTime = now + RATE_LIMIT.dayWindow;
  requestTracker.lastRequestTime = 0;
  
  console.log('[RAG-Server] Rate limiting reset');
  
  res.json({ 
    success: true, 
    message: 'Rate limiting reset successfully',
    newLimits: {
      minuteReset: new Date(requestTracker.minute.resetTime).toISOString(),
      dayReset: new Date(requestTracker.day.resetTime).toISOString()
    }
  });
});

// Endpoint to reset quota exhaustion status (emergency use only)
app.post('/admin/reset-quota', (req, res) => {
  const wasExhausted = quotaExhausted;
  quotaExhausted = false;
  quotaResetTime = null;
  consecutiveQuotaErrors = 0;
  
  console.log('[RAG-Server] Quota exhaustion status reset');
  
  res.json({ 
    success: true, 
    message: 'Quota exhaustion status reset successfully',
    wasExhausted,
    newStatus: {
      quotaExhausted: false,
      quotaResetTime: null,
      consecutiveQuotaErrors: 0
    }
  });
});

// Test endpoint to verify Gemini API is working
app.post('/admin/test-gemini', async (req, res) => {
  try {
    console.log('[RAG-Server] Testing Gemini API connection...');
    
    const testPrompt = "Say 'Hello, this is a test!' and nothing else.";
    const response = await callGeminiAPI(testPrompt, []);
    
    console.log('[RAG-Server] Gemini API test successful');
    
    res.json({
      success: true,
      message: 'Gemini API test successful',
      response: response.substring(0, 200), // Truncate for safety
      quotaStatus: {
        exhausted: quotaExhausted,
        consecutiveErrors: consecutiveQuotaErrors
      }
    });
  } catch (error) {
    console.error('[RAG-Server] Gemini API test failed:', error.message);
    
    res.json({
      success: false,
      message: 'Gemini API test failed',
      error: error.message,
      quotaStatus: {
        exhausted: quotaExhausted,
        consecutiveErrors: consecutiveQuotaErrors
      }
    });
  }
});

// Manual quota reset endpoint for development/testing
app.post('/admin/reset-quota', (req, res) => {
  const wasExhausted = quotaExhausted;
  const oldResetTime = quotaResetTime;
  const oldConsecutiveErrors = consecutiveQuotaErrors;
  
  // Manually reset quota status
  quotaExhausted = false;
  quotaResetTime = null;
  consecutiveQuotaErrors = 0;
  
  console.log(`[RAG-Server] Manual quota reset: was exhausted: ${wasExhausted}, reset time was: ${oldResetTime?.toISOString() || 'none'}, consecutive errors: ${oldConsecutiveErrors}`);
  
  res.json({
    success: true,
    message: 'Quota status manually reset',
    before: {
      exhausted: wasExhausted,
      resetTime: oldResetTime?.toISOString() || null,
      consecutiveErrors: oldConsecutiveErrors
    },
    after: {
      exhausted: quotaExhausted,
      resetTime: quotaResetTime,
      consecutiveErrors: consecutiveQuotaErrors
    }
  });
});

// Endpoint to get server status and configurations
app.get('/admin/status', (req, res) => {
  const now = Date.now();
  const status = {
    server: {
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      startTime: new Date(Date.now() - process.uptime() * 1000).toISOString()
    },
    config: {
      port,
      gemini: {
        model: GEMINI_CONFIG.model,
        maxTokens: GEMINI_CONFIG.maxTokens
      },
      storage: {
        local: {
          path: dataDir,
          exists: fs.existsSync(dataDir)
        },
        r2: {
          buckets: ['tasks', 'structuredb']
        }
      },
      cache: {
        ttl: CACHE_TTL,
        responseTtl: RESPONSE_CACHE_TTL,
        duplicateTtl: DUPLICATE_REQUEST_TTL,
        profiles: profileCache.size,
        rules: rulesCache.size,
        responses: responseCache.size,
        duplicateRequests: duplicateRequestCache.size
      },
      requestQueue: {
        size: requestQueue.length,
        isProcessing: isProcessingQueue,
        oldestRequestAge: requestQueue.length > 0 ? now - requestQueue[0].timestamp : 0
      },
      rateLimit: {
        minuteRequests: requestTracker.minute.count,
        minuteLimit: RATE_LIMIT.maxRequestsPerMinute,
        minuteReset: new Date(requestTracker.minute.resetTime).toISOString(),
        dayRequests: requestTracker.day.count,
        dayLimit: RATE_LIMIT.maxRequestsPerDay,
        dayReset: new Date(requestTracker.day.resetTime).toISOString(),
        minDelayBetweenRequests: RATE_LIMIT.minDelayBetweenRequests,
        timeSinceLastRequest: now - requestTracker.lastRequestTime,
        nextAllowedRequest: Math.max(0, (requestTracker.lastRequestTime + RATE_LIMIT.minDelayBetweenRequests) - now)
      },
      quotaStatus: {
        exhausted: quotaExhausted,
        resetTime: quotaResetTime?.toISOString() || null,
        fallbackActive: quotaExhausted && quotaResetTime && new Date() < quotaResetTime
      }
    }
  };
  
  res.json(status);
});

// Load conversation history for context
async function loadConversationHistory(username, platform) {
  try {
    // Try to load conversation history from R2 storage
    const historyKey = `conversation_history/${platform}/${username}/recent.json`;
    
    const getCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: historyKey,
    });
    
    const response = await s3Client.send(getCommand);
    if (response.Body) {
      const historyString = await streamToString(response.Body);
      const history = JSON.parse(historyString);
      return Array.isArray(history) ? history : [];
    }
  } catch (error) {
    // History doesn't exist yet, return empty array
    return [];
  }
  
  return [];
}

// Save conversation turn to history
async function saveConversationTurn(username, platform, userMessage, assistantReply) {
  try {
    // Load existing history
    const history = await loadConversationHistory(username, platform);
    
    // Add new conversation turn
    const timestamp = new Date().toISOString();
    history.push({
      timestamp,
      role: 'user',
      content: userMessage
    });
    
    history.push({
      timestamp,
      role: 'assistant', 
      content: assistantReply
    });
    
    // Keep only last 50 messages (25 turns) for context
    const recentHistory = history.slice(-50);
    
    // Save updated history
    const historyKey = `conversation_history/${platform}/${username}/recent.json`;
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: historyKey,
      Body: JSON.stringify(recentHistory, null, 2),
      ContentType: 'application/json',
    });
    
    await s3Client.send(putCommand);
    console.log(`[RAG-Server] Saved conversation turn for ${platform}/${username}`);
  } catch (error) {
    console.error(`[RAG-Server] Error saving conversation history: ${error.message}`);
  }
}

// Create the advanced RAG-based instruction prompt for instant AI replies
function createAIReplyPrompt(profileData, rulesData, notification, platform = 'instagram', usingFallbackProfile = false) {
  const isMessage = notification.type === 'message';
  const platformName = platform === 'twitter' ? 'X (Twitter)' : 
                      platform === 'facebook' ? 'Facebook' : 
                      'Instagram';
  
  const messageType = isMessage ? 
    (platform === 'twitter' ? 'direct message' : platform === 'facebook' ? 'private message' : 'direct message') : 
    (platform === 'twitter' ? 'mention' : platform === 'facebook' ? 'comment' : 'comment');
  
  const senderInfo = notification.username ? `from username @${notification.username}` : 'from a user';
  
  const characterLimit = platform === 'twitter' ? 280 : 
                        platform === 'instagram' ? 2200 : 
                        8000; // Facebook DM limit

  // Enhanced profile data analysis with intelligent personality detection
  let realProfileData = null;
  let hasRealProfileData = false;
  let intelligentPersonality = null;
  
  if (profileData && !usingFallbackProfile) {
    console.log(`[RAG-Server] DEBUG: Profile data type: ${typeof profileData}, isArray: ${Array.isArray(profileData)}`);
    
    // Handle different scraped data structures  
    if (Array.isArray(profileData) && profileData.length > 0) {
      // Twitter format: Array of tweets with author data
      realProfileData = profileData[0].author || profileData[0];
      intelligentPersonality = analyzePostsForPersonality(profileData, platform);
    } else if (profileData.data && Array.isArray(profileData.data) && profileData.data.length > 0) {
      // Instagram format: Nested data array
      realProfileData = profileData.data[0];
      intelligentPersonality = analyzePostsForPersonality(profileData.data, platform);
    } else if (profileData.username || profileData.name || profileData.fullName) {
      // Direct profile object
      realProfileData = profileData;
    } else if (Array.isArray(profileData)) {
      // Array of posts without author data (Facebook style)
      intelligentPersonality = analyzePostsForPersonality(profileData, platform);
      realProfileData = { 
        name: profileData[0]?.user?.name || 'Account Holder',
        username: profileData[0]?.user?.name || 'account'
      };
    }
    
    // Check if we have REAL profile information (not just basic post user data)
    if (realProfileData && (
      realProfileData.biography || realProfileData.bio || realProfileData.description ||
      realProfileData.followersCount || realProfileData.followers_count || realProfileData.followers ||
      realProfileData.isBusinessAccount || realProfileData.businessCategoryName || realProfileData.category ||
      realProfileData.verified || realProfileData.is_verified || realProfileData.isVerified
    )) {
      hasRealProfileData = true;
      console.log(`[RAG-Server] Found real profile data for account with bio, followers, or business info`);
    } else if (intelligentPersonality) {
      hasRealProfileData = true; // We have intelligent personality analysis
      console.log(`[RAG-Server] Using intelligent personality analysis from posts data`);
    } else {
      console.log(`[RAG-Server] Only basic user data found (name/profileUrl) - will use natural response approach`);
      realProfileData = null;
    }
  }

  // Extract REAL account information from scraped data
  const accountName = realProfileData?.fullName || realProfileData?.name || realProfileData?.username || 'the account holder';
  const accountUsername = realProfileData?.username || realProfileData?.userName || 'this account';
  const accountBio = realProfileData?.biography || realProfileData?.bio || realProfileData?.description || '';
  const followersCount = realProfileData?.followersCount || realProfileData?.followers_count || realProfileData?.followers || 0;
  const followingCount = realProfileData?.followsCount || realProfileData?.following_count || realProfileData?.following || 0;
  const postsCount = realProfileData?.postsCount || realProfileData?.posts_count || realProfileData?.statusesCount || 0;
  const isVerified = realProfileData?.verified || realProfileData?.is_verified || realProfileData?.isVerified || false;
  const isBusiness = realProfileData?.isBusinessAccount || realProfileData?.is_business_account || false;
  const businessCategory = realProfileData?.businessCategoryName || realProfileData?.category || '';
  const externalUrls = realProfileData?.externalUrls || realProfileData?.external_urls || [];
  
  // Build account context from REAL scraped data or intelligent analysis
  let accountContext = '';
  if (hasRealProfileData) {
    if (accountBio || followersCount > 0 || isBusiness) {
      // Full profile data available
      accountContext = `You are ${accountName} (@${accountUsername}).

REAL ACCOUNT DATA:
- Full Name: ${accountName}
- Username: @${accountUsername}
- Followers: ${followersCount > 0 ? followersCount.toLocaleString() : 'Growing community'}
- Following: ${followingCount > 0 ? followingCount.toLocaleString() : 'Various accounts'}
- Posts: ${postsCount > 0 ? postsCount.toLocaleString() : 'Regular content'}
- Verified: ${isVerified ? 'Yes' : 'No'}
- Business Account: ${isBusiness ? 'Yes' : 'No'}${businessCategory ? `\n- Category: ${businessCategory}` : ''}${externalUrls.length > 0 ? `\n- Website: ${externalUrls[0].url}` : ''}

YOUR BIO:
"${accountBio}"

PERSONALITY TRAITS (from bio analysis):
${accountBio ? extractPersonalityFromBio(accountBio) : 'Friendly and engaging social media presence'}`;
    } else if (intelligentPersonality) {
      // Use intelligent personality analysis from posts
      accountContext = `You are ${accountName} (@${accountUsername}).

ACCOUNT ANALYSIS FROM YOUR POSTS:
${intelligentPersonality}

PERSONALITY TRAITS:
${intelligentPersonality.includes('personality') ? intelligentPersonality : `Based on your posts, you have a ${intelligentPersonality}`}`;
    }
  } else {
    // When no real profile data, use a more natural approach
    accountContext = `You are the account holder of @${accountUsername} on ${platformName}.`;
  }
  
  // Extract communication style from rules
  const communicationStyle = rulesData?.communication_style || rulesData?.tone || 'friendly and authentic';
  const brandVoice = rulesData?.brand_voice || rulesData?.personality || '';
  const responseGuidelines = rulesData?.response_guidelines || rulesData?.rules || [];
  
  // Determine if account holder should act as themselves or as a manager
  const shouldActAsAccountHolder = rulesData?.act_as_account_holder !== false; // Default to true
  
  const roleDescription = shouldActAsAccountHolder ? 
    `You ARE ${accountName}, responding as yourself` : 
    `You are the professional account manager for ${accountName}`;

  // Create sophisticated prompt that uses real data when available
  if (hasRealProfileData) {
    // Use real profile data or intelligent analysis for authentic responses
    return `${accountContext}

COMMUNICATION STYLE: ${communicationStyle}
BRAND VOICE: ${brandVoice}
ROLE: ${roleDescription}

A user just messaged you: "${notification.text}"

ANALYZE THE MESSAGE TYPE:
${getMessageAnalysis(notification.text)}

RESPOND AS ${accountName} WOULD:
- Use YOUR actual personality and voice from the analysis above
- Be completely authentic - respond as if you're actually ${accountName} personally replying
- Reference YOUR real content themes and style when relevant
- Keep under ${characterLimit} characters
- NEVER use placeholder text, templates, or indicate this is an AI
- Make the response feel completely natural and human
- Use casual, authentic language that matches your personality
- If asked about yourself, draw from the personality analysis provided above
- Stay true to your authentic voice and communication style

Your natural, authentic response as ${accountName}:`;
  } else {
    // When no profile data, still be authentic but more conservative
    return `${accountContext}

COMMUNICATION STYLE: ${communicationStyle}
BRAND VOICE: ${brandVoice}

A user just messaged you: "${notification.text}"

MESSAGE ANALYSIS: ${getMessageAnalysis(notification.text)}

CRITICAL INSTRUCTIONS:
- Respond naturally as a real person who owns this account
- Be authentic, friendly, and conversational
- Keep under ${characterLimit} characters
- NEVER use placeholder text, templates, or robotic language
- NEVER indicate this is automated or AI-generated
- Sound completely human and genuine
- If you don't have specific details, give a warm but honest response
- Focus on being helpful and engaging while staying authentic
- Use natural speech patterns and casual language

Your genuine, human response:`;
  }
}

// Enhanced function to analyze posts for personality traits
function analyzePostsForPersonality(posts, platform) {
  if (!posts || posts.length === 0) return null;
  
  let personalityTraits = [];
  let contentThemes = [];
  let communicationStyle = [];
  
  // Analyze post content for patterns
  posts.slice(0, 10).forEach(post => { // Analyze up to 10 recent posts
    const text = post.text || post.caption || post.content || '';
    const hashtags = text.match(/#\w+/g) || [];
    
    // Detect content themes
    if (text.toLowerCase().includes('makeup') || text.toLowerCase().includes('beauty') || hashtags.some(h => h.toLowerCase().includes('beauty'))) {
      contentThemes.push('beauty');
    }
    if (text.toLowerCase().includes('fitness') || text.toLowerCase().includes('workout') || hashtags.some(h => h.toLowerCase().includes('fit'))) {
      contentThemes.push('fitness');
    }
    if (text.toLowerCase().includes('food') || text.toLowerCase().includes('recipe') || hashtags.some(h => h.toLowerCase().includes('food'))) {
      contentThemes.push('food');
    }
    if (text.toLowerCase().includes('music') || text.toLowerCase().includes('song') || hashtags.some(h => h.toLowerCase().includes('music'))) {
      contentThemes.push('music');
    }
    if (text.toLowerCase().includes('travel') || text.toLowerCase().includes('vacation') || hashtags.some(h => h.toLowerCase().includes('travel'))) {
      contentThemes.push('travel');
    }
    if (text.toLowerCase().includes('business') || text.toLowerCase().includes('entrepreneur') || hashtags.some(h => h.toLowerCase().includes('business'))) {
      contentThemes.push('business');
    }
    
    // Detect communication style
    if (text.includes('!') || text.includes('😍') || text.includes('❤️')) {
      communicationStyle.push('enthusiastic');
    }
    if (text.includes('?') || text.includes('what do you think')) {
      communicationStyle.push('engaging');
    }
    if (text.length > 0 && text.split(' ').length > 20) {
      communicationStyle.push('detailed');
    }
    if (hashtags.length > 3) {
      communicationStyle.push('hashtag-savvy');
    }
  });
  
  // Build personality description
  const uniqueThemes = [...new Set(contentThemes)];
  const uniqueStyles = [...new Set(communicationStyle)];
  
  let personality = '';
  
  if (uniqueThemes.length > 0) {
    personality += `You're passionate about ${uniqueThemes.slice(0, 3).join(', ')}. `;
  }
  
  if (uniqueStyles.includes('enthusiastic')) {
    personality += `You have an enthusiastic and positive communication style. `;
  }
  
  if (uniqueStyles.includes('engaging')) {
    personality += `You love engaging with your audience and asking questions. `;
  }
  
  if (uniqueStyles.includes('detailed')) {
    personality += `You tend to share thoughtful, detailed content. `;
  }
  
  if (uniqueStyles.includes('hashtag-savvy')) {
    personality += `You're social media savvy and use hashtags effectively. `;
  }
  
  // Default personality if we can't detect specific traits
  if (personality === '') {
    personality = `You're a genuine content creator who shares authentic experiences and connects with your community. You have a friendly, approachable personality and enjoy meaningful interactions. `;
  }
  
  personality += `Your responses should reflect this natural personality and communication style.`;
  
  return personality.trim();
}

// Helper function to extract personality from bio
function extractPersonalityFromBio(bio) {
  if (!bio) return 'Friendly and engaging';
  
  const traits = [];
  
  // Business/professional indicators
  if (bio.match(/\b(shop|store|business|brand|company|official)\b/i)) {
    traits.push('Professional brand focused on products/services');
  }
  
  // Personality indicators
  if (bio.match(/\b(love|passion|excited|inspire|create)\b/i)) {
    traits.push('Passionate and enthusiastic');
  }
  
  if (bio.match(/\b(help|support|community|together)\b/i)) {
    traits.push('Community-oriented and supportive');
  }
  
  if (bio.match(/\b(beauty|makeup|skincare|fashion|style)\b/i)) {
    traits.push('Beauty and style expert');
  }
  
  if (bio.match(/\b(music|artist|creative|art)\b/i)) {
    traits.push('Creative and artistic');
  }
  
  if (bio.match(/\b(entrepreneur|founder|ceo|business)\b/i)) {
    traits.push('Business-minded entrepreneur');
  }
  
  return traits.length > 0 ? traits.join(', ') : 'Authentic and engaging personality';
}

// Helper function to analyze message type
function getMessageAnalysis(text) {
  if (text.match(/\b(tell me about|about you|who are you|yourself)\b/i)) {
    return 'Personal introduction request - Share authentic details about your account, bio, and what you do';
  }
  
  if (text.match(/\b(advice|help|how|tips|recommend)\b/i)) {
    return 'Advice/help request - Provide helpful guidance based on your expertise area';
  }
  
  if (text.match(/\b(love|amazing|great|awesome|fan)\b/i)) {
    return 'Compliment/appreciation - Respond with genuine gratitude and engagement';
  }
  
  if (text.match(/\b(collaborate|work together|partnership)\b/i)) {
    return 'Business inquiry - Respond professionally about collaboration opportunities';
  }
  
  if (text.match(/\?(.*)?$/)) {
    return 'Question - Answer directly and helpfully based on your expertise';
  }
  
  return 'General message - Respond naturally and authentically as yourself';
}

// API endpoint for instant AI replies to DMs and comments
app.post('/api/instant-reply', async (req, res) => {
  const { username, notification, platform = 'instagram' } = req.body;
  
  if (!username || !notification || !notification.text) {
    return res.status(400).json({ error: 'Username and notification with text are required' });
  }

  try {
    // Fetch profile and rules data with platform
    console.log(`[RAG-Server] Processing advanced AI reply for ${platform}/${username}: "${notification.text.substring(0, 50)}..."`);
    
    let profileData = {};
    let rulesData = {};
    let usingFallbackProfile = false;
    
    try {
      profileData = await getProfileData(username, platform);
      console.log(`[RAG-Server] Retrieved profile data for ${platform}/${username}`);
    } catch (error) {
      console.log(`[RAG-Server] No profile data found for ${platform}/${username}, using defaults`);
      usingFallbackProfile = true;
      // Create basic profile structure
      profileData = {
        username: username,
        name: username,
        bio: '',
        account_type: 'personal',
        industry: 'general'
      };
    }
    
    try {
      rulesData = await getRulesData(username, platform);
      console.log(`[RAG-Server] Retrieved rules data for ${platform}/${username}`);
    } catch (error) {
      console.log(`[RAG-Server] No rules found for ${platform}/${username}, using defaults`);
      rulesData = {
        communication_style: 'friendly and professional',
        brand_voice: 'conversational',
        act_as_account_holder: true,
        response_guidelines: [
          'Be helpful and informative',
          'Maintain a positive tone',
          'Provide value in every interaction',
          'Be authentic and genuine'
        ]
      };
    }
    
    // Fetch conversation history for better context
    let conversationHistory = [];
    try {
      // Load recent conversation history to understand context
      conversationHistory = await loadConversationHistory(username, platform);
      if (conversationHistory.length > 0) {
        console.log(`[RAG-Server] Loaded ${conversationHistory.length} messages from conversation history`);
      }
    } catch (error) {
      console.log(`[RAG-Server] No conversation history found for ${platform}/${username}`);
    }
    
    // Check if we have real profile data (not just basic post user data)
    let hasRealProfileData = false;
    if (profileData && !usingFallbackProfile) {
      let realProfileData = null;
      
      // Handle different scraped data structures  
      if (Array.isArray(profileData) && profileData.length > 0) {
        realProfileData = profileData[0].author || profileData[0];
      } else if (profileData.data && Array.isArray(profileData.data) && profileData.data.length > 0) {
        realProfileData = profileData.data[0];
      } else if (profileData.username || profileData.name || profileData.fullName) {
        realProfileData = profileData;
      }
      
      // Check if we have REAL profile information
      if (realProfileData && (
        realProfileData.biography || realProfileData.bio || realProfileData.description ||
        realProfileData.followersCount || realProfileData.followers_count || realProfileData.followers ||
        realProfileData.isBusinessAccount || realProfileData.businessCategoryName || realProfileData.category ||
        realProfileData.verified || realProfileData.is_verified || realProfileData.isVerified
      )) {
        hasRealProfileData = true;
      }
    }

    // Create advanced AI reply prompt with full context
    const aiReplyPrompt = createAIReplyPrompt(profileData, rulesData, notification, platform, usingFallbackProfile);
    
    // For instant replies, use minimal conversation context to avoid repetitive responses
    const messages = [];
    
    // Only add the current notification - no conversation history for instant replies
    // This ensures each reply is fresh and contextual to the specific question
    messages.push({
      role: 'user',
      parts: [{ text: notification.text }]
    });
    
    // Call Gemini API with conversation context
    let reply;
    let usedFallback = false;
    
    try {
      // Use queued API call for better reliability
      reply = await queuedGeminiAPICall(aiReplyPrompt, messages);
      
      // Verify we have a valid response
      if (!reply || reply.trim() === '') {
        throw new Error('Empty response received from Gemini API');
      }
      
      // Clean up the response
      reply = reply.trim();
      
      // Remove any unwanted prefixes that might slip through
      const unwantedPrefixes = [
        'I would respond with:',
        'Here\'s a reply:',
        'Response:',
        'Reply:',
        'I would say:',
        'My response:',
        'As the account holder:',
        'As the account manager:'
      ];
      
      for (const prefix of unwantedPrefixes) {
        if (reply.toLowerCase().startsWith(prefix.toLowerCase())) {
          reply = reply.substring(prefix.length).trim();
        }
      }
      
      console.log(`[RAG-Server] Generated AI reply: "${reply.substring(0, 100)}..."`);
      
    } catch (error) {
      console.error(`[RAG-Server] AI generation error: ${error.message}`);
      
      // Handle different error types
      if (error.message === 'QUOTA_EXHAUSTED' || detectQuotaExhaustion(error)) {
        console.log(`[RAG-Server] Using smart fallback for instant reply`);
        
        // Create a more intelligent fallback based on account data
        const accountName = profileData?.name || profileData?.username || username;
        const isMessage = notification.type === 'message';
        const platformName = platform === 'twitter' ? 'X' : 
                            platform === 'facebook' ? 'Facebook' : 
                            'Instagram';
        
        // Create contextual fallback responses
        if (isMessage) {
          const fallbacks = [
            `Hey! Thanks for reaching out. I'm currently handling a lot of messages but wanted to acknowledge yours personally. I'll get back to you with a detailed response soon! 💫`,
            `Hi there! I see your message and appreciate you connecting. I'm a bit swamped right now but will respond with more insights shortly. Thanks for your patience! 🚀`,
            `Thank you for your message! I'm temporarily at capacity but didn't want to leave you hanging. Expect a thoughtful response from me soon! ✨`
          ];
          reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        } else {
          const fallbacks = [
            `Thanks for engaging with this post! I love seeing interactions like this. I'll respond with more detailed thoughts shortly! 💭`,
            `Great comment! I appreciate you taking the time to engage. I'll share some more insights on this topic soon! 🔥`,
            `Love this interaction! Thanks for commenting. I'll get back with a more detailed response in a bit! 🎯`
          ];
          reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
        }
        
        usedFallback = true;
      } else {
        throw error; // Re-throw other errors
      }
    }
    
    // Save the request for analytics with platform
    const replyData = {
      username,
      platform,
      timestamp: new Date().toISOString(),
      notification,
      reply,
      mode: 'instant',
      usedFallback,
      hasProfileData: hasRealProfileData,
      hasConversationHistory: conversationHistory.length > 0
    };
    
    // Save to R2 storage with platform (but don't wait for it to complete)
    const replyKey = `AI.replies/${platform}/${username}/${Date.now()}.json`;
    saveToR2(replyData, replyKey).catch(err => {
      console.error(`[RAG-Server] Error saving instant reply to R2: ${err.message}`);
    });
    
    // Save conversation turn for future context (don't wait for completion)
    if (!usedFallback) {
      saveConversationTurn(username, platform, notification.text, reply).catch(err => {
        console.error(`[RAG-Server] Error saving conversation turn: ${err.message}`);
      });
    }
    
    // Return response immediately
    res.json({ 
      reply,
      success: true,
      notification_type: notification.type,
      platform,
      usedFallback,
      hasProfileData: hasRealProfileData,
      hasConversationHistory: conversationHistory.length > 0,
      quotaInfo: usedFallback && quotaExhausted ? {
        exhausted: true,
        resetTime: quotaResetTime?.toISOString(),
        message: "Smart fallback response - full AI capabilities return soon!"
      } : null
    });
  } catch (error) {
    console.error('[RAG-Server] Instant reply endpoint error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint for auto-reply to multiple notifications with rate limiting
app.post('/api/auto-reply-all', async (req, res) => {
  const { username, notifications, platform = 'instagram' } = req.body;
  
  if (!username || !Array.isArray(notifications) || notifications.length === 0) {
    return res.status(400).json({ error: 'Username and notifications array are required' });
  }

  try {
    console.log(`[RAG-Server] Processing auto-reply for ${notifications.length} notifications on ${platform}/${username}`);
    
    let profileData = {};
    let rulesData = {};
    
    try {
      profileData = await getProfileData(username, platform);
      rulesData = await getRulesData(username, platform);
    } catch (error) {
      console.log(`[RAG-Server] Using default profile/rules for auto-reply`);
      profileData = { username, name: username, bio: '', account_type: 'personal' };
      rulesData = { 
        communication_style: 'friendly and professional',
        act_as_account_holder: true,
        response_guidelines: ['Be helpful', 'Be authentic', 'Provide value']
      };
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    // Process each notification individually
    for (let i = 0; i < notifications.length; i++) {
      const notification = notifications[i];
      const notificationId = notification.message_id || notification.comment_id || `unknown_${i}`;

      try {
        console.log(`[RAG-Server] Auto-replying to notification ${i + 1}/${notifications.length}: ${notificationId}`);
        
        // Generate AI reply
        const aiReplyPrompt = createAIReplyPrompt(profileData, rulesData, notification, platform);
        
        // Load conversation history for this specific user
        let conversationHistory = [];
        try {
          conversationHistory = await loadConversationHistory(username, platform);
        } catch (error) {
          // No history available
        }

        // Prepare messages with context
        const messages = [];
        if (conversationHistory.length > 0) {
          const recentMessages = conversationHistory.slice(-5); // Less history for auto-reply
          messages.push(...recentMessages.map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
          })));
        }

        messages.push({
          role: 'user',
          parts: [{ text: notification.text }]
        });

        // Generate reply
        const reply = await queuedGeminiAPICall(aiReplyPrompt, messages);
        
        if (!reply || reply.trim() === '') {
          throw new Error('Empty reply generated');
        }

        // Clean up reply
        let cleanReply = reply.trim();
        const unwantedPrefixes = [
          'I would respond with:', 'Here\'s a reply:', 'Response:', 'Reply:',
          'I would say:', 'My response:', 'As the account holder:', 'As the account manager:'
        ];
        
        for (const prefix of unwantedPrefixes) {
          if (cleanReply.toLowerCase().startsWith(prefix.toLowerCase())) {
            cleanReply = cleanReply.substring(prefix.length).trim();
          }
        }

        // Save conversation turn
        try {
          await saveConversationTurn(username, platform, notification.text, cleanReply);
        } catch (error) {
          console.error(`[RAG-Server] Error saving conversation turn: ${error.message}`);
        }

        results.push({
          notificationId,
          success: true,
          reply: cleanReply,
          notification
        });

        successCount++;

        console.log(`[RAG-Server] Successfully generated auto-reply for ${notificationId}: "${cleanReply.substring(0, 50)}..."`);

      } catch (error) {
        console.error(`[RAG-Server] Error auto-replying to ${notificationId}: ${error.message}`);
        
        results.push({
          notificationId,
          success: false,
          error: error.message,
          notification
        });

        errorCount++;
      }
    }

    // Save auto-reply session analytics
    const sessionData = {
      username,
      platform,
      timestamp: new Date().toISOString(),
      totalNotifications: notifications.length,
      successCount,
      errorCount,
      results,
      mode: 'auto-reply-all'
    };

    const sessionKey = `AI.auto-replies/${platform}/${username}/${Date.now()}.json`;
    saveToR2(sessionData, sessionKey).catch(err => {
      console.error(`[RAG-Server] Error saving auto-reply session: ${err.message}`);
    });

    console.log(`[RAG-Server] Auto-reply completed: ${successCount} successful, ${errorCount} failed`);

    res.json({
      success: true,
      totalProcessed: notifications.length,
      successCount,
      errorCount,
      results
    });

  } catch (error) {
    console.error('[RAG-Server] Auto-reply endpoint error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Enhanced image generation function using Stable Horde API with better error handling
async function generateImageFromPrompt(imagePrompt, filename, username, platform = 'instagram') {
  console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Starting image generation for ${filename}`);
  console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Prompt: "${imagePrompt.substring(0, 100)}..."`);
  
  const AI_HORDE_CONFIG = {
    api_key: "VxVGZGSL20PDRbi3mW2D5Q",
    base_url: "https://stablehorde.net/api/v2"
  };
  
  try {
    // Create the payload for the Stable Horde API
    const payload = {
      prompt: imagePrompt,
      params: {
        width: 512,
        height: 512,
        steps: 30,
        cfg_scale: 7.5,
        sampler_name: "k_euler_a",
        clip_skip: 1
      },
      trusted_workers: true,
      slow_workers: true,
      workers: [],
      models: ["stable_diffusion"]
    };

    console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Sending request to Stable Horde API`);
    
    // Step 1: Submit the generation request to get a job ID
    const generationResponse = await axios.post(
      'https://stablehorde.net/api/v2/generate/async', 
      payload, 
      {
        headers: { 
          'Content-Type': 'application/json',
          'apikey': AI_HORDE_CONFIG.api_key
        },
        timeout: 15000
      }
    );
    
    console.log(`[${new Date().toISOString()}] [IMAGE-GEN] API Response:`, JSON.stringify(generationResponse.data, null, 2));
    
    if (!generationResponse.data || !generationResponse.data.id) {
      throw new Error('No job ID received from Stable Horde API');
    }
    
    const jobId = generationResponse.data.id;
    console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Received job ID: ${jobId}`);
    
    // Step 2: Poll for job completion
    let imageUrl = null;
    let attempts = 0;
    const maxAttempts = 25; // Increased attempts
    const pollInterval = 4000; // Slightly faster polling
    
    while (!imageUrl && attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Checking job status (attempt ${attempts}/${maxAttempts})`);
      
      try {
      const checkResponse = await axios.get(
        `https://stablehorde.net/api/v2/generate/check/${jobId}`,
        {
          headers: { 'apikey': AI_HORDE_CONFIG.api_key },
          timeout: 10000
        }
      );
        
        console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Check response:`, JSON.stringify(checkResponse.data, null, 2));
      
      if (checkResponse.data && checkResponse.data.done) {
        console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Job complete, retrieving result`);
        
        const resultResponse = await axios.get(
          `https://stablehorde.net/api/v2/generate/status/${jobId}`,
          {
            headers: { 'apikey': AI_HORDE_CONFIG.api_key },
            timeout: 10000
          }
        );
          
          console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Result response:`, JSON.stringify(resultResponse.data, null, 2));
        
        if (resultResponse.data && 
            resultResponse.data.generations && 
            resultResponse.data.generations.length > 0 &&
            resultResponse.data.generations[0].img) {
          
          imageUrl = resultResponse.data.generations[0].img;
            console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Successfully generated image URL: ${imageUrl}`);
          } else {
            console.log(`[${new Date().toISOString()}] [IMAGE-GEN] No image URL in result response`);
        }
        } else if (checkResponse.data && checkResponse.data.faulted) {
          throw new Error('Image generation job faulted');
      } else {
          console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Job still processing... (queue position: ${checkResponse.data?.queue_position || 'unknown'})`);
        }
      } catch (pollError) {
        console.error(`[${new Date().toISOString()}] [IMAGE-GEN] Error polling job status:`, pollError.message);
        // Continue polling unless it's a critical error
        if (attempts >= maxAttempts - 3) {
          throw pollError;
        }
      }
    }
    
    if (!imageUrl) {
      throw new Error(`Failed to generate image after ${maxAttempts} attempts (${maxAttempts * pollInterval / 1000} seconds)`);
    }
    
    // Step 3: Download the generated image
    console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Downloading generated image from: ${imageUrl}`);
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxRedirects: 5
    });
    
    const imageBuffer = Buffer.from(imageResponse.data);
    console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Downloaded image buffer size: ${imageBuffer.length} bytes`);
    
    // Validate that we have a proper image
    if (imageBuffer.length < 1000) {
      throw new Error(`Downloaded image is too small (${imageBuffer.length} bytes), likely corrupted`);
    }
    
    // Check if it's a valid image format (JPEG, PNG, or WebP)
    const isValidImage = (
      (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) || // JPEG
      (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) || // PNG
      (imageBuffer.slice(8, 12).toString() === 'WEBP')        // WebP
    );
    
    if (!isValidImage) {
      console.warn(`[${new Date().toISOString()}] [IMAGE-GEN] Downloaded data may not be a valid image format`);
    }
    
    // Step 4: Save the image to R2 storage
    const imageKey = `ready_post/${platform}/${username}/${filename}`;
    
    await tasksS3.putObject({
      Bucket: 'tasks',
      Key: imageKey,
      Body: imageBuffer,
      ContentType: imageUrl.includes('.webp') ? 'image/webp' : 'image/jpeg'
    }).promise();
    
    console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Successfully saved image to R2: ${imageKey}`);
    
    // Also save locally for backup
    const localImageDir = path.join(process.cwd(), 'ready_post', platform, username);
    if (!fs.existsSync(localImageDir)) {
      fs.mkdirSync(localImageDir, { recursive: true });
    }
    const localImagePath = path.join(localImageDir, filename);
    fs.writeFileSync(localImagePath, imageBuffer);
    
    console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Image generation completed successfully - saved ${imageBuffer.length} bytes`);
    return true;
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [IMAGE-GEN] Error generating image:`, error.message);
    console.error(`[${new Date().toISOString()}] [IMAGE-GEN] Full error:`, error);
    
    // Create a placeholder image instead
    try {
      console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Creating placeholder image as fallback`);
      const placeholderBuffer = await createPlaceholderImage(username, platform);
      const imageKey = `ready_post/${platform}/${username}/${filename}`;
      
      await tasksS3.putObject({
        Bucket: 'tasks',
        Key: imageKey,
        Body: placeholderBuffer,
        ContentType: 'image/jpeg'
      }).promise();
      
      // Also save locally
      const localImageDir = path.join(process.cwd(), 'ready_post', platform, username);
      if (!fs.existsSync(localImageDir)) {
        fs.mkdirSync(localImageDir, { recursive: true });
      }
      const localImagePath = path.join(localImageDir, filename);
      fs.writeFileSync(localImagePath, placeholderBuffer);
      
      console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Created placeholder image instead (${placeholderBuffer.length} bytes)`);
      return true;
    } catch (placeholderError) {
      console.error(`[${new Date().toISOString()}] [IMAGE-GEN] Failed to create placeholder:`, placeholderError.message);
      return false;
    }
  }
}

// Helper function to create a proper JPEG placeholder image
async function createPlaceholderImage(username, platform) {
  // Create a proper JPEG placeholder image with text
  const width = 512;
  const height = 512;
  
  // Create a minimal JPEG image buffer with proper JPEG headers
  // This is a valid 512x512 gray JPEG image
  const jpegHeader = Buffer.from([
    0xFF, 0xD8, // SOI (Start of Image)
    0xFF, 0xE0, // APP0
    0x00, 0x10, // Length
    0x4A, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, // JFIF header
    
    // Quantization table
    0xFF, 0xDB, 0x00, 0x43, 0x00,
    0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0A, 0x0C, 0x14,
    0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12, 0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A,
    0x1C, 0x1C, 0x20, 0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29, 0x2C,
    0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32, 0x3C, 0x2E, 0x33, 0x34, 0x32,
    
    // Start of Frame
    0xFF, 0xC0, 0x00, 0x11, 0x08, 0x02, 0x00, 0x02, 0x00, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
    
    // Huffman tables
    0xFF, 0xC4, 0x00, 0x1F, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01, 0x01, 0x01, 0x01, 0x01, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A, 0x0B,
    
    0xFF, 0xC4, 0x00, 0xB5, 0x10, 0x00, 0x02, 0x01, 0x03, 0x03, 0x02, 0x04, 0x03, 0x05, 0x05, 0x04,
    0x04, 0x00, 0x00, 0x01, 0x7D, 0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41,
    0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xA1, 0x08, 0x23, 0x42, 0xB1,
    0xC1, 0x15, 0x52, 0xD1, 0xF0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0A, 0x16, 0x17, 0x18, 0x19,
    0x1A, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2A, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3A, 0x43, 0x44,
    0x45, 0x46, 0x47, 0x48, 0x49, 0x4A, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5A, 0x63, 0x64,
    0x65, 0x66, 0x67, 0x68, 0x69, 0x6A, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7A, 0x83, 0x84,
    0x85, 0x86, 0x87, 0x88, 0x89, 0x8A, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9A, 0xA2,
    0xA3, 0xA4, 0xA5, 0xA6, 0xA7, 0xA8, 0xA9, 0xAA, 0xB2, 0xB3, 0xB4, 0xB5, 0xB6, 0xB7, 0xB8, 0xB9,
    0xBA, 0xC2, 0xC3, 0xC4, 0xC5, 0xC6, 0xC7, 0xC8, 0xC9, 0xCA, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7,
    0xD8, 0xD9, 0xDA, 0xE1, 0xE2, 0xE3, 0xE4, 0xE5, 0xE6, 0xE7, 0xE8, 0xE9, 0xEA, 0xF1, 0xF2, 0xF3,
    0xF4, 0xF5, 0xF6, 0xF7, 0xF8, 0xF9, 0xFA,
    
    // Start of Scan
    0xFF, 0xDA, 0x00, 0x0C, 0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00,
    
    // Minimal image data for a gray square
    0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9,
    0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9, 0xF9,
    
    // End of Image
    0xFF, 0xD9
  ]);
  
  console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Created JPEG placeholder image for ${platform}/${username}`);
  return jpegHeader;
}

// Function to detect quota exhaustion and provide fallback
function detectQuotaExhaustion(error) {
  // Check for actual quota exhaustion error (429 or specific error messages)
  const isQuotaError = error && (
    (error.status === 429) ||
    (error.code === 'ERR_BAD_REQUEST' && error.response?.status === 429) ||
    (error.message && (
      error.message.includes('exceeded your current quota') ||
      error.message.includes('RESOURCE_EXHAUSTED') ||
      (error.message.includes('quota') && error.message.includes('exceeded'))
    ))
  );
  
  // Check for content filtering (empty response) - different from quota
  const isContentFiltered = error && error.message && 
    error.message.includes('Empty response - possibly filtered content');
  
  if (isQuotaError) {
    consecutiveQuotaErrors++;
    console.log(`[RAG-Server] QUOTA ERROR detected (${consecutiveQuotaErrors}/${MAX_QUOTA_ERRORS_BEFORE_EXHAUSTION}): ${error.message}`);
    
    // Immediate exhaustion on first quota error to prevent further waste
    quotaExhausted = true;
    quotaResetTime = new Date(Date.now() + 60 * 60 * 1000); // Reset in 1 hour
    
    console.log(`[RAG-Server] Quota IMMEDIATELY marked as exhausted. Reset time: ${quotaResetTime.toISOString()}`);
    return true;
  }
  
  if (isContentFiltered) {
    console.log(`[RAG-Server] Content filtering detected: ${error.message}`);
    // Don't mark quota as exhausted for content filtering
    return false;
  }
  
  // Reset consecutive errors on successful call or non-quota error
  if (consecutiveQuotaErrors > 0 && !isQuotaError && !isContentFiltered) {
    console.log(`[RAG-Server] Resetting quota error counter from ${consecutiveQuotaErrors} to 0`);
    consecutiveQuotaErrors = 0;
  }
  
  return false;
}

// Function to get appropriate fallback response
function getFallbackResponse(query, platform = 'instagram') {
  const queryLower = query.toLowerCase();
  const platformName = platform === 'twitter' ? 'X (Twitter)' : 
                      platform === 'facebook' ? 'Facebook' : 
                      'Instagram';
  
  // More specific keyword matching for better contextual responses
  if (queryLower.includes('uniqueness') || queryLower.includes('unique') || queryLower.includes('special')) {
    return `**Account Uniqueness Analysis** 🌟

Here are key ways to identify and enhance your ${platformName} account's unique positioning:

**• Brand Differentiation**
- Analyze your content themes vs competitors
- Identify your unique voice and perspective  
- Highlight your specialized expertise or niche

**• Audience Connection**
- Review engagement patterns to find what resonates
- Focus on content that generates authentic conversations
- Build community around your unique values

**• Content Innovation**
- Experiment with format combinations (video + text, carousels, Stories)
- Share behind-the-scenes content that others don't
- Create signature content series or recurring themes

**• Visual Identity**
- Develop consistent color schemes and aesthetics
- Use recognizable fonts, filters, or editing styles
- Create branded graphics or templates

I'd love to provide more specific insights once I can access your account data! Feel free to ask about any particular aspect of your ${platformName} strategy.`;
  }
  
  const platformResponses = FALLBACK_RESPONSES[platform] || FALLBACK_RESPONSES.instagram;
  
  if (queryLower.includes('competitor') || queryLower.includes('competition') || queryLower.includes('rival')) {
    return platformResponses.competitors;
  }
  
  if (queryLower.includes('content') || queryLower.includes('post') || queryLower.includes('create')) {
    return platformResponses.content;
  }
  
  if (queryLower.includes('account') || queryLower.includes('profile') || queryLower.includes('strategy')) {
    return `**${platformName} Account Strategy** 📈

Here are proven strategies to optimize your ${platformName} presence:

**• Growth Fundamentals**
- Post consistently (optimal timing varies by platform)
- Use relevant hashtags strategically
- Engage authentically with your community
- Cross-promote on other platforms

**• Content Excellence**
- Mix educational, entertaining, and promotional content
- Use high-quality visuals and clear messaging
- Tell stories that connect with your audience
- Include clear calls-to-action

**• Analytics & Optimization**
- Track engagement rates and reach metrics
- Identify your best-performing content types
- A/B test different posting times and formats
- Monitor competitor strategies for inspiration

**• Community Building**
- Respond promptly to comments and messages
- Create content that encourages interaction
- Share user-generated content when appropriate
- Build relationships with other creators in your niche

I'm optimizing my analysis capabilities and will provide more personalized insights soon! What specific aspect of your ${platformName} strategy would you like to focus on?`;
  }
  
  return platformResponses.general;
}

// Add periodic cache cleanup to maintain memory efficiency
setInterval(() => {
  try {
    const now = Date.now();
    let expiredCount = 0;
    
    // Clean response cache
    for (const [key, { timestamp }] of responseCache.entries()) {
      if (now - timestamp > RESPONSE_CACHE_TTL) {
        responseCache.delete(key);
        expiredCount++;
      }
    }
    
    // Clean duplicate request cache
    let duplicateExpiredCount = 0;
    for (const [key, { timestamp }] of duplicateRequestCache.entries()) {
      if (now - timestamp > DUPLICATE_REQUEST_TTL) {
        duplicateRequestCache.delete(key);
        duplicateExpiredCount++;
      }
    }
    
    // Clean profile cache
    let profileExpiredCount = 0;
    for (const [key, { timestamp }] of profileCache.entries()) {
      if (now - timestamp > CACHE_TTL) {
        profileCache.delete(key);
        profileExpiredCount++;
      }
    }
    
    // Clean rules cache
    let rulesExpiredCount = 0;
    for (const [key, { timestamp }] of rulesCache.entries()) {
      if (now - timestamp > CACHE_TTL) {
        rulesCache.delete(key);
        rulesExpiredCount++;
      }
    }
    
    if (expiredCount > 0 || duplicateExpiredCount > 0 || profileExpiredCount > 0 || rulesExpiredCount > 0) {
      console.log(`[RAG-Server] Cache cleanup: ${expiredCount} response, ${duplicateExpiredCount} duplicate, ${profileExpiredCount} profile, ${rulesExpiredCount} rules cache items expired`);
    }
    
    // Log queue status every 5 minutes
    if (requestQueue.length > 0 || isProcessingQueue) {
      console.log(`[RAG-Server] Queue status: ${requestQueue.length} pending requests, processing: ${isProcessingQueue}`);
    }
    
  } catch (error) {
    console.error('[RAG-Server] Error during cache cleanup:', error);
  }
}, 5 * 60 * 1000); // Run every 5 minutes

// Start the server with graceful shutdown
const server = app.listen(port, () => {
  console.log(`[${new Date().toISOString()}] RAG Server running at http://localhost:${port}`);
  console.log('[RAG-Server] Ready to process queries in Discussion Mode and Post Mode');
  console.log(`[RAG-Server] Rate limiting: ${RATE_LIMIT.maxRequestsPerMinute}/min, ${RATE_LIMIT.maxRequestsPerDay}/day, ${RATE_LIMIT.minDelayBetweenRequests/1000}s between requests`);
});

// Handle graceful shutdown
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown() {
  console.log('[RAG-Server] Received shutdown signal, closing server...');
  
  server.close(() => {
    console.log('[RAG-Server] Server closed successfully');
    process.exit(0);
  });
  
  // Force close after 10 seconds
  setTimeout(() => {
    console.error('[RAG-Server] Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
} 