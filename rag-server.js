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

// Rate limiting configuration - More generous limits
const RATE_LIMIT = {
  maxRequestsPerMinute: 50, // Increased for better performance
  maxRequestsPerHour: 3000, // Increased hourly limit
  requestWindow: 60 * 1000, // 1 minute
  hourWindow: 60 * 60 * 1000 // 1 hour
};

// Request tracking for rate limiting
const requestTracker = {
  minute: { count: 0, resetTime: Date.now() + RATE_LIMIT.requestWindow },
  hour: { count: 0, resetTime: Date.now() + RATE_LIMIT.hourWindow }
};

// Enhanced cache configuration
const profileCache = new Map();
const rulesCache = new Map();
const responseCache = new Map(); // New: Cache AI responses
const CACHE_TTL = 15 * 60 * 1000; // Increased to 15 minutes
const RESPONSE_CACHE_TTL = 30 * 60 * 1000; // 30 minutes for AI responses

// Quota exhaustion tracking
let quotaExhausted = false;
let quotaResetTime = null;

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
        
        // Handle R2 image URLs
        if (obj.r2_image_url && typeof obj.r2_image_url === 'string') {
          if (obj.r2_image_url.includes('.r2.cloudflarestorage.com') || obj.r2_image_url.includes('.r2.dev')) {
            // Extract filename from URL
            const filename = obj.r2_image_url.split('/').pop().split('?')[0];
            obj.r2_image_url = `http://localhost:3002/fix-image/${username}/${filename}?platform=${platform}`;
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

// Rate limiting check function
function checkRateLimit() {
  const now = Date.now();
  
  // Reset minute counter if window expired
  if (now > requestTracker.minute.resetTime) {
    requestTracker.minute.count = 0;
    requestTracker.minute.resetTime = now + RATE_LIMIT.requestWindow;
  }
  
  // Reset hour counter if window expired
  if (now > requestTracker.hour.resetTime) {
    requestTracker.hour.count = 0;
    requestTracker.hour.resetTime = now + RATE_LIMIT.hourWindow;
  }
  
  // Check limits
  if (requestTracker.minute.count >= RATE_LIMIT.maxRequestsPerMinute) {
    const waitTime = requestTracker.minute.resetTime - now;
    throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds before making another request.`);
  }
  
  if (requestTracker.hour.count >= RATE_LIMIT.maxRequestsPerHour) {
    const waitTime = requestTracker.hour.resetTime - now;
    throw new Error(`Hourly quota exceeded. Please wait ${Math.ceil(waitTime / 60000)} minutes before making more requests.`);
  }
  
  // Increment counters
  requestTracker.minute.count++;
  requestTracker.hour.count++;
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

// Helper function for Gemini API calls with retries and error handling
async function callGeminiAPI(prompt, messages = [], retries = 2) {
  // Check if quota is already known to be exhausted
  if (quotaExhausted && quotaResetTime && new Date() < quotaResetTime) {
    console.log('[RAG-Server] Quota exhausted, using fallback response');
    throw new Error('QUOTA_EXHAUSTED');
  }
  
  // Check rate limiting first - TEMPORARILY DISABLED FOR DEBUGGING
  // checkRateLimit();
  
  // Check response cache first
  const cacheKey = `${prompt.substring(0, 100)}_${JSON.stringify(messages).substring(0, 50)}`;
  if (responseCache.has(cacheKey)) {
    const { data, timestamp } = responseCache.get(cacheKey);
    if (Date.now() - timestamp < RESPONSE_CACHE_TTL) {
      console.log('[RAG-Server] Using cached AI response');
      return data;
    }
    responseCache.delete(cacheKey);
  }
  
  console.log('[RAG-Server] Calling Gemini API');
  
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
          formattedMessages.push({
            role: geminiRole,
            parts: [{ text: msg.content }]
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
      
      if (!response.data.candidates || response.data.candidates.length === 0 || !response.data.candidates[0].content) {
        console.log('[RAG-Server] Empty response from Gemini API, triggering fallback');
        throw new Error('QUOTA_EXHAUSTED');
      }
      
      const generatedText = response.data.candidates[0].content.parts[0].text;
      
      if (!generatedText || generatedText.trim() === '') {
        console.log('[RAG-Server] Empty generated text from Gemini API, triggering fallback');
        throw new Error('QUOTA_EXHAUSTED');
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
        // Exponential backoff
        const delay = 1000 * Math.pow(2, attempt - 1);
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
}

// Create the instruction prompt for RAG with profile and rules
function createRagPrompt(profileData, rulesData, query, platform = 'instagram', usingFallbackProfile = false) {
  const platformName = platform === 'twitter' ? 'X (Twitter)' : 
                      platform === 'facebook' ? 'Facebook' : 
                      'Instagram';
  
  const profileNote = usingFallbackProfile ? 
    `\nNOTE: Limited profile information available. Provide general ${platformName} best practices and strategies.` : 
    `\nUse the profile information to provide personalized advice.`;
  
  return `
# INSTRUCTION A - DISCUSSION MODE
You are a ${platformName} Manager Assistant helping with social media strategy for a user.

## USER PROFILE DATA
${JSON.stringify(profileData, null, 2)}

## ACCOUNT RULES
${JSON.stringify(rulesData, null, 2)}

## QUERY
${query}

${profileNote}

Please respond in a helpful, direct, and actionable manner that provides specific advice for the ${platformName} account.
Keep your response concise but informative, focusing on ${platformName}-specific best practices and strategies.
If you have specific profile details, reference them; otherwise, provide valuable general advice for ${platformName} growth and engagement.
`;
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
    
    // Check if this is a follow-up message
    const isFollowUp = previousMessages && previousMessages.length > 0;
    
    // Create RAG prompt
    let ragPrompt;
    if (isFollowUp) {
      const platformName = platform === 'twitter' ? 'X (Twitter)' : 
                          platform === 'facebook' ? 'Facebook' : 
                          'Instagram';
      
      // For follow-up messages, include a special instruction to handle context
      ragPrompt = `
# INSTRUCTION A - DISCUSSION MODE (FOLLOW-UP)
You are a ${platformName} Manager Assistant having a conversation with a user about their social media strategy.

## USER PROFILE DATA
${JSON.stringify(profileData, null, 2)}

## ACCOUNT RULES
${JSON.stringify(rulesData, null, 2)}

## CONVERSATION HISTORY
The user has been asking about their ${platformName} strategy. You've been answering their questions.
Review the conversation history provided separately to maintain context.

## CURRENT QUERY
${query}

Please respond in a helpful, direct, and actionable manner that provides specific advice for the ${platformName} account.
Maintain continuity with the previous parts of the conversation.
Keep your response concise but informative, with specific references to the user's account details when relevant.
Focus on ${platformName}-specific best practices and strategies.
`;
    } else {
      // For initial messages, use the standard prompt
      ragPrompt = createRagPrompt(profileData, rulesData, query, platform, usingFallbackProfile);
    }
    
    // Call Gemini API
    let response;
    let usedFallback = false;
    
    try {
      response = await callGeminiAPI(ragPrompt, previousMessages);
      
      // Verify we have a valid response
      if (!response || response.trim() === '') {
        // Try fallback approach for follow-ups - simplify by ignoring context
        if (isFollowUp) {
          console.log(`[RAG-Server] Empty response received for follow-up, trying fallback approach`);
          
          const platformName = platform === 'twitter' ? 'X (Twitter)' : 
                              platform === 'facebook' ? 'Facebook' : 
                              'Instagram';
          
          // Create a simplified prompt that doesn't rely on conversation history
          const fallbackPrompt = `
# INSTRUCTION A - DISCUSSION MODE (FALLBACK)
You are a ${platformName} Manager Assistant helping with social media strategy.

## USER PROFILE DATA
${JSON.stringify(profileData, null, 2)}

## ACCOUNT RULES
${JSON.stringify(rulesData, null, 2)}

## CONTEXT
The user has been asking about their ${platformName} strategy.
Their latest question is: "${query}"

Please respond directly to this question without requiring previous context.
Be helpful, direct, and actionable, providing specific advice for the ${platformName} account.
Focus on ${platformName}-specific best practices and strategies.
`;
          
          // Call Gemini API without previous messages
          const fallbackResponse = await callGeminiAPI(fallbackPrompt, []);
          
          if (!fallbackResponse || fallbackResponse.trim() === '') {
            throw new Error('Failed to generate response even with fallback approach');
          }
          
          response = fallbackResponse;
          usedFallback = true;
        } else {
          throw new Error('Empty response received from Gemini API');
        }
      }
    } catch (error) {
      // Handle quota exhaustion with graceful fallback
      if (error.message === 'QUOTA_EXHAUSTED') {
        console.log(`[RAG-Server] Using intelligent fallback response for quota exhaustion`);
        response = getFallbackResponse(query, platform);
        usedFallback = true;
      } else {
        throw error; // Re-throw other errors
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
      
      // Use our proxy URL format
      const baseUrl = req.get('host') ? `http://${req.get('host').replace('3001', '3002')}` : 'http://localhost:3002';
      const imageUrl = `${baseUrl}/fix-image/${username}/${imageFileName}?platform=${platform}`;
      
      // Create complete post data
      const postData = {
        post: structuredResponse,
        timestamp,
        image_path: `ready_post/${platform}/${username}/${imageFileName}`,
        image_url: imageUrl,
        r2_image_url: imageUrl,
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

// API endpoint to get conversation history
app.get('/api/conversations/:username', async (req, res) => {
  const { username } = req.params;
  const platform = req.query.platform || 'instagram';
  
  try {
    console.log(`[RAG-Server] Fetching conversation history for ${platform}/${username}`);
    
    // First try to get conversations from R2
    try {
      const data = await tasksS3.listObjects({
        Bucket: 'tasks',
        Prefix: `RAG.data/${platform}/${username}/`
      }).promise();
      
      if (data.Contents && data.Contents.length > 0) {
        // Sort by key in descending order (newest first) and take the latest one
        const latestKey = data.Contents
          .sort((a, b) => b.Key.localeCompare(a.Key))[0].Key;
        
        const conversationData = await tasksS3.getObject({
          Bucket: 'tasks',
          Key: latestKey
        }).promise();
        
        const parsedData = JSON.parse(conversationData.Body.toString());
        
        // Convert to chat message format
        const messages = [];
        if (parsedData.query && parsedData.response) {
          messages.push({ role: 'user', content: parsedData.query });
          messages.push({ role: 'assistant', content: parsedData.response });
        }
        
        if (parsedData.previousMessages && Array.isArray(parsedData.previousMessages)) {
          // Add previous messages at the beginning
          parsedData.previousMessages.forEach(msg => messages.unshift(msg));
        }
        
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
      res.json({ messages });
    } else {
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
  requestTracker.hour.count = 0;
  requestTracker.hour.resetTime = now + RATE_LIMIT.hourWindow;
  
  console.log('[RAG-Server] Rate limiting reset');
  
  res.json({ 
    success: true, 
    message: 'Rate limiting reset successfully',
    newLimits: {
      minuteReset: new Date(requestTracker.minute.resetTime).toISOString(),
      hourReset: new Date(requestTracker.hour.resetTime).toISOString()
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
        profiles: profileCache.size,
        rules: rulesCache.size,
        responses: responseCache.size
      },
      rateLimit: {
        minuteRequests: requestTracker.minute.count,
        minuteLimit: RATE_LIMIT.maxRequestsPerMinute,
        minuteReset: new Date(requestTracker.minute.resetTime).toISOString(),
        hourRequests: requestTracker.hour.count,
        hourLimit: RATE_LIMIT.maxRequestsPerHour,
        hourReset: new Date(requestTracker.hour.resetTime).toISOString(),
        nextAllowedRequest: Math.max(0, requestTracker.minute.resetTime - now)
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

// Create the instruction prompt for instant AI replies
function createAIReplyPrompt(profileData, rulesData, notification, platform = 'instagram') {
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
  
  return `
# INSTRUCTION - INSTANT AI REPLY MODE
You are a ${platformName} account manager assistant responding to a ${messageType} ${senderInfo}.

## USER PROFILE DATA
${JSON.stringify(profileData, null, 2)}

## ACCOUNT RULES
${JSON.stringify(rulesData, null, 2)}

## ${messageType.toUpperCase()} TO RESPOND TO
"${notification.text}"

IMPORTANT INSTRUCTIONS:
1. Respond in the same tone and language as the ${messageType}
2. Be concise and direct - ${platformName} ${messageType}s should be brief (under ${characterLimit} characters)
3. Be friendly and conversational, following ${platformName} best practices
4. Maintain the brand voice based on profile information
5. If the message is in a language other than English, respond in that same language
6. If you cannot determine the appropriate response, simply provide a polite acknowledgment
7. Do not add introductory phrases like "I would respond with:" or "Here's a reply:"
8. Just write the actual reply text that should be sent directly to the user on ${platformName}
`;
}

// API endpoint for instant AI replies to DMs and comments
app.post('/api/instant-reply', async (req, res) => {
  const { username, notification, platform = 'instagram' } = req.body;
  
  if (!username || !notification || !notification.text) {
    return res.status(400).json({ error: 'Username and notification with text are required' });
  }

  try {
    // Fetch profile and rules data with platform
    console.log(`[RAG-Server] Processing instant reply for ${platform}/${username}: "${notification.text}"`);
    const profileData = await getProfileData(username, platform).catch(() => ({}));
    const rulesData = await getRulesData(username, platform).catch(() => ({}));
    
    // Create AI reply prompt
    const aiReplyPrompt = createAIReplyPrompt(profileData, rulesData, notification, platform);
    
    // Call Gemini API with no previous messages (single turn)
    let reply;
    let usedFallback = false;
    
    try {
      reply = await callGeminiAPI(aiReplyPrompt);
      
      // Verify we have a valid response
      if (!reply || reply.trim() === '') {
        throw new Error('Empty response received from Gemini API');
      }
    } catch (error) {
      // Handle quota exhaustion for instant replies
      if (error.message === 'QUOTA_EXHAUSTED') {
        console.log(`[RAG-Server] Using fallback for instant reply`);
        
        // Simple acknowledgment fallback
        const isMessage = notification.type === 'message';
        const platformName = platform === 'twitter' ? 'X' : 
                            platform === 'facebook' ? 'Facebook' : 
                            'Instagram';
        
        if (isMessage) {
          reply = `Thank you for your message! I'm currently at capacity but wanted to acknowledge your ${platformName} message. I'll provide a detailed response soon! 🚀`;
        } else {
          reply = `Thanks for engaging with this post! I appreciate your comment and will respond with more insights shortly. Keep connecting! 💫`;
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
      mode: 'instant'
    };
    
    // Save to R2 storage with platform (but don't wait for it to complete)
    const replyKey = `AI.replies/${platform}/${username}/${Date.now()}.json`;
    saveToR2(replyData, replyKey).catch(err => {
      console.error(`[RAG-Server] Error saving instant reply to R2: ${err.message}`);
    });
    
    // Return response immediately
    res.json({ 
      reply,
      success: true,
      notification_type: notification.type,
      platform,
      usedFallback,
      quotaInfo: usedFallback && quotaExhausted ? {
        exhausted: true,
        resetTime: quotaResetTime?.toISOString(),
        message: "Quick acknowledgment sent - full AI response capabilities return soon!"
      } : null
    });
  } catch (error) {
    console.error('[RAG-Server] Instant reply endpoint error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Add image generation function using Stable Horde API
async function generateImageFromPrompt(imagePrompt, filename, username, platform = 'instagram') {
  console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Starting image generation for ${filename}`);
  
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
    
    if (!generationResponse.data || !generationResponse.data.id) {
      throw new Error('No job ID received from Stable Horde API');
    }
    
    const jobId = generationResponse.data.id;
    console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Received job ID: ${jobId}`);
    
    // Step 2: Poll for job completion
    let imageUrl = null;
    let attempts = 0;
    const maxAttempts = 20;
    const pollInterval = 5000; // 5 seconds
    
    while (!imageUrl && attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Checking job status (attempt ${attempts}/${maxAttempts})`);
      
      const checkResponse = await axios.get(
        `https://stablehorde.net/api/v2/generate/check/${jobId}`,
        {
          headers: { 'apikey': AI_HORDE_CONFIG.api_key },
          timeout: 10000
        }
      );
      
      if (checkResponse.data && checkResponse.data.done) {
        console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Job complete, retrieving result`);
        
        const resultResponse = await axios.get(
          `https://stablehorde.net/api/v2/generate/status/${jobId}`,
          {
            headers: { 'apikey': AI_HORDE_CONFIG.api_key },
            timeout: 10000
          }
        );
        
        if (resultResponse.data && 
            resultResponse.data.generations && 
            resultResponse.data.generations.length > 0 &&
            resultResponse.data.generations[0].img) {
          
          imageUrl = resultResponse.data.generations[0].img;
          console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Successfully generated image`);
        }
      } else {
        console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Job still processing...`);
      }
    }
    
    if (!imageUrl) {
      throw new Error(`Failed to generate image after ${maxAttempts} attempts`);
    }
    
    // Step 3: Download the generated image
    console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Downloading generated image`);
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000
    });
    
    const imageBuffer = Buffer.from(imageResponse.data);
    
    // Step 4: Save the image to R2 storage
    const imageKey = `ready_post/${platform}/${username}/${filename}`;
    
    await tasksS3.putObject({
      Bucket: 'tasks',
      Key: imageKey,
      Body: imageBuffer,
      ContentType: 'image/jpeg'
    }).promise();
    
    console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Successfully saved image to R2: ${imageKey}`);
    
    // Also save locally for backup
    const localImageDir = path.join(process.cwd(), 'ready_post', platform, username);
    if (!fs.existsSync(localImageDir)) {
      fs.mkdirSync(localImageDir, { recursive: true });
    }
    const localImagePath = path.join(localImageDir, filename);
    fs.writeFileSync(localImagePath, imageBuffer);
    
    console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Image generation completed successfully`);
    return true;
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [IMAGE-GEN] Error generating image:`, error.message);
    
    // Create a placeholder image instead
    try {
      const placeholderBuffer = await createPlaceholderImage(username, platform);
      const imageKey = `ready_post/${platform}/${username}/${filename}`;
      
      await tasksS3.putObject({
        Bucket: 'tasks',
        Key: imageKey,
        Body: placeholderBuffer,
        ContentType: 'image/jpeg'
      }).promise();
      
      console.log(`[${new Date().toISOString()}] [IMAGE-GEN] Created placeholder image instead`);
      return true;
    } catch (placeholderError) {
      console.error(`[${new Date().toISOString()}] [IMAGE-GEN] Failed to create placeholder:`, placeholderError.message);
      return false;
    }
  }
}

// Helper function to create a placeholder image
async function createPlaceholderImage(username, platform) {
  // Simple colored rectangle as placeholder
  const width = 512;
  const height = 512;
  
  // Create a simple colored placeholder (this is a minimal implementation)
  // In a real scenario, you might want to use a proper image generation library
  const placeholderData = Buffer.alloc(width * height * 3, 128); // Gray image
  
  // Return a simple gray image buffer (this is very basic - you might want to use canvas or similar)
  return placeholderData;
}

// Function to detect quota exhaustion and provide fallback
function detectQuotaExhaustion(error) {
  if (error && error.message && error.message.includes('exceeded your current quota')) {
    quotaExhausted = true;
    // Gemini typically resets daily, so set reset time to next day
    quotaResetTime = new Date();
    quotaResetTime.setDate(quotaResetTime.getDate() + 1);
    quotaResetTime.setHours(0, 0, 0, 0);
    
    console.log(`[RAG-Server] Quota exhausted. Next reset estimated: ${quotaResetTime.toISOString()}`);
    return true;
  }
  return false;
}

// Function to get appropriate fallback response
function getFallbackResponse(query, platform = 'instagram') {
  const queryLower = query.toLowerCase();
  const platformResponses = FALLBACK_RESPONSES[platform] || FALLBACK_RESPONSES.instagram;
  
  // Simple keyword matching for better responses
  if (queryLower.includes('competitor') || queryLower.includes('competition') || queryLower.includes('rival')) {
    return platformResponses.competitors;
  }
  
  if (queryLower.includes('content') || queryLower.includes('post') || queryLower.includes('create')) {
    return platformResponses.content;
  }
  
  return platformResponses.general;
}

// Start the server with graceful shutdown
const server = app.listen(port, () => {
  console.log(`[${new Date().toISOString()}] RAG Server running at http://localhost:${port}`);
  console.log('[RAG-Server] Ready to process queries in Discussion Mode and Post Mode');
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