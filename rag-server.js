import express from 'express';
import cors from 'cors';
import AWS from 'aws-sdk';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const app = express();
const port = 3001;

// Configure CORS
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json({ limit: '10mb' }));

// Enhanced logging middleware
const loggerMiddleware = (req, res, next) => {
  const start = Date.now();
  const requestId = Math.random().toString(36).substring(2, 15);
  
  console.log(`[${new Date().toISOString()}] [${requestId}] ${req.method} ${req.url}`);
  
  // Capture the original end method
  const originalEnd = res.end;
  
  // Override the end method to log response time
  res.end = function(...args) {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] [${requestId}] Completed ${res.statusCode} in ${duration}ms`);
    
    // Call the original end method
    originalEnd.apply(res, args);
  };
  
  next();
};

app.use(loggerMiddleware);

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
  endpoint: 'https://9069781eea9a108d41848d73443b3a87.r2.cloudflarestorage.com',
  accessKeyId: 'b94be077bc48dcc2aec3e4331233327e',
  secretAccessKey: '791d5eeddcd8ed5bf3f41bfaebbd37e58af7dcb12275b1422747605d7dc75bc4',
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

// Configure Gemini API
const GEMINI_CONFIG = {
  apiKey: 'AIzaSyDrvJG2BghzqtSK-HIZ_NsfRWiNwrIk3DQ',
  model: 'gemini-2.0-flash',
  maxTokens: 2000,
  temperature: 0.2,
  topP: 0.95,
  topK: 40
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

// Cache for profile and rules data to reduce API calls
const profileCache = new Map();
const rulesCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helper function to retrieve profile data from structuredb with caching
async function getProfileData(username) {
  const cacheKey = `profile_${username}`;
  
  // Check cache first
  if (profileCache.has(cacheKey)) {
    const { data, timestamp } = profileCache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL) {
      console.log(`[RAG-Server] Using cached profile data for ${username}`);
      return data;
    }
    // Cache expired
    profileCache.delete(cacheKey);
  }
  
  // Check local file cache
  const cacheFilePath = path.join(cacheDir, `${username}_profile.json`);
  if (fs.existsSync(cacheFilePath)) {
    try {
      const cacheData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
      if (cacheData.timestamp && Date.now() - new Date(cacheData.timestamp).getTime() < CACHE_TTL) {
        console.log(`[RAG-Server] Using file-cached profile data for ${username}`);
        
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
  
  console.log(`[RAG-Server] Retrieving profile data for ${username}`);
  try {
    const data = await structuredbS3.getObject({
      Bucket: 'structuredb',
      Key: `${username}/${username}.json`
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
    console.error(`[RAG-Server] Error retrieving profile data for ${username}:`, error);
    
    if (error.code === 'NoSuchKey') {
      throw new Error(`Profile data not found for ${username}`);
    }
    
    // Check if we have a stale cache as fallback
    if (fs.existsSync(cacheFilePath)) {
      try {
        console.log(`[RAG-Server] Using stale profile cache for ${username} as fallback`);
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
async function getRulesData(username) {
  const cacheKey = `rules_${username}`;
  
  // Check cache first
  if (rulesCache.has(cacheKey)) {
    const { data, timestamp } = rulesCache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL) {
      console.log(`[RAG-Server] Using cached rules data for ${username}`);
      return data;
    }
    // Cache expired
    rulesCache.delete(cacheKey);
  }
  
  // Check local file cache
  const cacheFilePath = path.join(cacheDir, `${username}_rules.json`);
  if (fs.existsSync(cacheFilePath)) {
    try {
      const cacheData = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
      if (cacheData.timestamp && Date.now() - new Date(cacheData.timestamp).getTime() < CACHE_TTL) {
        console.log(`[RAG-Server] Using file-cached rules data for ${username}`);
        
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
  
  console.log(`[RAG-Server] Retrieving rules data for ${username}`);
  try {
    const data = await tasksS3.getObject({
      Bucket: 'tasks',
      Key: `rules/${username}/rules.json`
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
    console.error(`[RAG-Server] Error retrieving rules data for ${username}:`, error);
    
    // Rules are optional, so return empty object if not found
    if (error.code === 'NoSuchKey') {
      console.log(`[RAG-Server] No rules found for ${username}, using defaults`);
      
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
        console.log(`[RAG-Server] Using stale rules cache for ${username} as fallback`);
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

// Helper function for Gemini API calls with retries and error handling
async function callGeminiAPI(prompt, messages = [], retries = 2) {
  console.log('[RAG-Server] Calling Gemini API');
  
  let lastError = null;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      // Format messages properly for Gemini
      const formattedMessages = [];
      
      // First add the system prompt as a user message
      formattedMessages.push({
        role: 'user',
        parts: [{ text: prompt }]
      });
      
      // Then add the conversation history
      if (messages && messages.length > 0) {
        // Convert our simple format to Gemini's expected format
        let currentRole = null;
        let currentContent = [];
        
        for (const msg of messages) {
          const geminiRole = msg.role === 'assistant' ? 'model' : 'user';
          
          // If this is a new role, or the first message, create a new message object
          if (geminiRole !== currentRole) {
            // Add the previous message if we have one
            if (currentRole && currentContent.length > 0) {
              formattedMessages.push({
                role: currentRole,
                parts: currentContent.map(text => ({ text }))
              });
            }
            
            // Start a new message
            currentRole = geminiRole;
            currentContent = [msg.content];
          } else {
            // Continue the current message
            currentContent.push(msg.content);
          }
        }
        
        // Add the last message
        if (currentRole && currentContent.length > 0) {
          formattedMessages.push({
            role: currentRole,
            parts: currentContent.map(text => ({ text }))
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
      
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CONFIG.model}:generateContent`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': GEMINI_CONFIG.apiKey
          },
          timeout: 30000 // 30 seconds timeout
        }
      );
      
      if (!response.data.candidates || response.data.candidates.length === 0 || !response.data.candidates[0].content) {
        throw new Error('Empty response from Gemini API');
      }
      
      const generatedText = response.data.candidates[0].content.parts[0].text;
      
      // Save successful response for debugging
      fs.writeFileSync(
        path.join(debugDir, `gemini_response_${Date.now()}.json`),
        JSON.stringify(response.data, null, 2)
      );
      
      return generatedText;
    } catch (error) {
      lastError = error;
      console.error(`[RAG-Server] Gemini API error (attempt ${attempt}/${retries + 1}):`, error.response?.data || error.message);
      
      if (attempt <= retries) {
        // Exponential backoff
        const delay = 2000 * Math.pow(2, attempt - 1);
        console.log(`[RAG-Server] Retrying Gemini API call in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // If we've exhausted retries, throw an error with details
  if (lastError && lastError.response?.data?.error?.message) {
    throw new Error(`Error calling Gemini API: ${lastError.response.data.error.message}`);
  } else {
    throw new Error('Error calling Gemini API: Failed after multiple attempts');
  }
}

// Create the instruction prompt for RAG with profile and rules
function createRagPrompt(profileData, rulesData, query) {
  return `
# INSTRUCTION A - DISCUSSION MODE
You are an Instagram Manager Assistant helping with social media strategy for a user.

## USER PROFILE DATA
${JSON.stringify(profileData, null, 2)}

## ACCOUNT RULES
${JSON.stringify(rulesData, null, 2)}

## QUERY
${query}

Please respond in a helpful, direct, and actionable manner that provides specific advice for the Instagram account based on their profile information.
Keep your response concise but informative, with specific references to the user's account details when relevant.
`;
}

// API endpoint for discussion mode
app.post('/api/discussion', async (req, res) => {
  const { username, query, previousMessages = [] } = req.body;
  
  if (!username || !query) {
    return res.status(400).json({ error: 'Username and query are required' });
  }

  try {
    // Fetch profile and rules data
    console.log(`[RAG-Server] Processing discussion query for ${username}: "${query}"`);
    const profileData = await getProfileData(username);
    const rulesData = await getRulesData(username).catch(() => ({}));
    
    // Check if this is a follow-up message
    const isFollowUp = previousMessages && previousMessages.length > 0;
    
    // Create RAG prompt
    let ragPrompt;
    if (isFollowUp) {
      // For follow-up messages, include a special instruction to handle context
      ragPrompt = `
# INSTRUCTION A - DISCUSSION MODE (FOLLOW-UP)
You are an Instagram Manager Assistant having a conversation with a user about their social media strategy.

## USER PROFILE DATA
${JSON.stringify(profileData, null, 2)}

## ACCOUNT RULES
${JSON.stringify(rulesData, null, 2)}

## CONVERSATION HISTORY
The user has been asking about their Instagram strategy. You've been answering their questions.
Review the conversation history provided separately to maintain context.

## CURRENT QUERY
${query}

Please respond in a helpful, direct, and actionable manner that provides specific advice for the Instagram account.
Maintain continuity with the previous parts of the conversation.
Keep your response concise but informative, with specific references to the user's account details when relevant.
`;
    } else {
      // For initial messages, use the standard prompt
      ragPrompt = createRagPrompt(profileData, rulesData, query);
    }
    
    // Call Gemini API
    const response = await callGeminiAPI(ragPrompt, previousMessages);
    
    // Verify we have a valid response
    if (!response || response.trim() === '') {
      // Try fallback approach for follow-ups - simplify by ignoring context
      if (isFollowUp) {
        console.log(`[RAG-Server] Empty response received for follow-up, trying fallback approach`);
        
        // Create a simplified prompt that doesn't rely on conversation history
        const fallbackPrompt = `
# INSTRUCTION A - DISCUSSION MODE (FALLBACK)
You are an Instagram Manager Assistant helping with social media strategy.

## USER PROFILE DATA
${JSON.stringify(profileData, null, 2)}

## ACCOUNT RULES
${JSON.stringify(rulesData, null, 2)}

## CONTEXT
The user has been asking about their Instagram strategy.
Their latest question is: "${query}"

Please respond directly to this question without requiring previous context.
Be helpful, direct, and actionable, providing specific advice for the Instagram account.
`;
        
        // Call Gemini API without previous messages
        const fallbackResponse = await callGeminiAPI(fallbackPrompt, []);
        
        if (!fallbackResponse || fallbackResponse.trim() === '') {
          throw new Error('Failed to generate response even with fallback approach');
        }
        
        // Save conversation with fallback response
        const conversationData = {
          username,
          timestamp: new Date().toISOString(),
          query,
          response: fallbackResponse,
          previousMessages,
          usedFallback: true
        };
        
        const conversationKey = `RAG.data/${username}/${Date.now()}_fallback.json`;
        await saveToR2(conversationData, conversationKey);
        
        return res.json({ response: fallbackResponse, usedFallback: true });
      } else {
        throw new Error('Empty response received from Gemini API');
      }
    }
    
    // Save conversation to R2
    const conversationData = {
      username,
      timestamp: new Date().toISOString(),
      query,
      response,
      previousMessages
    };
    
    // Save to R2 storage
    const conversationKey = `RAG.data/${username}/${Date.now()}.json`;
    await saveToR2(conversationData, conversationKey);
    
    // Return response
    res.json({ response });
  } catch (error) {
    console.error('[RAG-Server] Discussion endpoint error:', error.message);
    
    if (error.message.includes('Profile data not found')) {
      return res.status(404).json({ error: `Profile data not found for ${username}. Please ensure the username is correct.` });
    }
    
    res.status(500).json({ error: error.message });
  }
});

// Create the post generation prompt
function createPostGenerationPrompt(profileData, rulesData, query) {
  return `
# POST GENERATION MODE
You are an Instagram content creator assistant.

## USER PROFILE DATA
${JSON.stringify(profileData, null, 2)}

## ACCOUNT RULES
${JSON.stringify(rulesData, null, 2)}

## POST REQUEST
${query}

Please create an Instagram post content that aligns with the user's profile and follows their account rules.
The response should include:
1. A caption that is engaging and relevant
2. Appropriate hashtags (5-10)
3. A brief description of what image or video should accompany this post
`;
}

// API endpoint for post generator
app.post('/api/post-generator', async (req, res) => {
  const { username, query } = req.body;
  
  if (!username || !query) {
    return res.status(400).json({ error: 'Username and query are required' });
  }

  try {
    // Fetch profile and rules data
    console.log(`[RAG-Server] Processing post generation query for ${username}: "${query}"`);
    const profileData = await getProfileData(username);
    const rulesData = await getRulesData(username).catch(() => ({}));
    
    // Create post generation prompt
    const postPrompt = createPostGenerationPrompt(profileData, rulesData, query);
    
    // Call Gemini API
    const response = await callGeminiAPI(postPrompt);
    
    // Save post data to R2
    const postData = {
      username,
      timestamp: new Date().toISOString(),
      query,
      response
    };
    
    const postKey = `ready_post/${username}/${Date.now()}.json`;
    await saveToR2(postData, postKey);
    
    // Return response
    res.json({ response });
  } catch (error) {
    console.error('[RAG-Server] Post generator endpoint error:', error.message);
    
    if (error.message.includes('Profile data not found')) {
      return res.status(404).json({ error: `Profile data not found for ${username}. Please ensure the username is correct.` });
    }
    
    res.status(500).json({ error: error.message });
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
  
  try {
    console.log(`[RAG-Server] Fetching conversation history for ${username}`);
    
    // First try to get conversations from R2
    try {
      const data = await tasksS3.listObjects({
        Bucket: 'tasks',
        Prefix: `RAG.data/${username}/`
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
      console.log(`[RAG-Server] No R2 conversation data for ${username}, using local fallback`);
    }
    
    // Fallback to local storage if R2 fails or has no data
    const conversationFile = path.join(conversationsDir, `${username}.json`);
    
    if (fs.existsSync(conversationFile)) {
      const data = fs.readFileSync(conversationFile, 'utf8');
      const messages = JSON.parse(data);
      res.json({ messages });
    } else {
      res.json({ messages: [] });
    }
  } catch (error) {
    console.error(`[RAG-Server] Error fetching conversations for ${username}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// API endpoint to save conversation history
app.post('/api/conversations/:username', async (req, res) => {
  const { username } = req.params;
  const { messages } = req.body;
  
  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages must be an array' });
  }
  
  try {
    console.log(`[RAG-Server] Saving conversation for ${username} (${messages.length} messages)`);
    
    // Save to local storage
    const conversationFile = path.join(conversationsDir, `${username}.json`);
    fs.writeFileSync(conversationFile, JSON.stringify(messages, null, 2));
    
    // Also save to R2 for persistence
    const conversationData = {
      username,
      timestamp: new Date().toISOString(),
      previousMessages: messages
    };
    
    const conversationKey = `RAG.data/${username}/${Date.now()}_conversation.json`;
    await saveToR2(conversationData, conversationKey);
    
    res.json({ success: true });
  } catch (error) {
    console.error(`[RAG-Server] Error saving conversation for ${username}:`, error);
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
  
  console.log('[RAG-Server] Cache cleared');
  
  res.json({ success: true, message: 'Cache cleared successfully' });
});

// Endpoint to get server status and configurations
app.get('/admin/status', (req, res) => {
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
        profiles: profileCache.size,
        rules: rulesCache.size
      }
    }
  };
  
  res.json(status);
});

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