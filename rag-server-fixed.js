import express from 'express';
import cors from 'cors';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const app = express();
const port = process.env.RAG_SERVER_PORT || 3002;

// Simple CORS setup
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// R2 Configuration
const R2_CONFIG = {
  endpoint: 'https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: '18f60c98e08f1a24040de7cb7aab646c',
    secretAccessKey: '0a8c50865ecab3c410baec4d751f35493fd981f4851203fe205fe0f86063a5f6',
  }
};

const structuredbS3 = new S3Client(R2_CONFIG);

// Gemini Configuration - SIMPLIFIED
const GEMINI_CONFIG = {
  apiKey: 'AIzaSyDIpv14PCIuAukCFV4CILMhYk0OzpNI6EE',
  model: 'gemini-2.0-flash',
  maxTokens: 1500,
  temperature: 0.3
};

// Simple cache
const profileCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Helper to read stream to string
async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

// Get profile data with caching
async function getProfileData(username, platform = 'facebook') {
  const cacheKey = `${platform}_${username}`;
  
  // Check cache
  if (profileCache.has(cacheKey)) {
    const { data, timestamp } = profileCache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL) {
      console.log(`[RAG] Using cached profile for ${platform}/${username}`);
      return data;
    }
  }
  
  try {
    console.log(`[RAG] Fetching profile data for ${platform}/${username}`);
    const response = await structuredbS3.send(new GetObjectCommand({
      Bucket: 'structuredb',
      Key: `${platform}/${username}/${username}.json`
    }));
    
    const profileData = JSON.parse(await streamToString(response.Body));
    
    // Cache the data
    profileCache.set(cacheKey, {
      data: profileData,
      timestamp: Date.now()
    });
    
    console.log(`[RAG] Successfully loaded profile for ${platform}/${username}`);
    return profileData;
  } catch (error) {
    console.error(`[RAG] Error loading profile for ${platform}/${username}:`, error.message);
    return null;
  }
}

// Extract relevant context from profile data
function extractProfileContext(profileData, platform) {
  if (!profileData) return "No profile data available.";
  
  let context = `Platform: ${platform.toUpperCase()}\n`;
  
  try {
    // Basic profile info
    if (profileData.profile) {
      const profile = profileData.profile;
      if (profile.name) context += `Account Name: ${profile.name}\n`;
      if (profile.followers_count) context += `Followers: ${profile.followers_count}\n`;
      if (profile.following_count) context += `Following: ${profile.following_count}\n`;
      if (profile.posts_count) context += `Posts: ${profile.posts_count}\n`;
      if (profile.bio) context += `Bio: ${profile.bio}\n`;
    }
    
    // Recent posts for engagement context
    if (profileData.posts && Array.isArray(profileData.posts)) {
      const recentPosts = profileData.posts.slice(0, 3);
      context += `\nRecent Posts:\n`;
      recentPosts.forEach((post, index) => {
        if (post.caption) context += `${index + 1}. ${post.caption.substring(0, 100)}...\n`;
        if (post.likes_count) context += `   Likes: ${post.likes_count}\n`;
        if (post.comments_count) context += `   Comments: ${post.comments_count}\n`;
      });
    }
    
    // Engagement metrics
    if (profileData.analytics) {
      context += `\nAnalytics:\n`;
      const analytics = profileData.analytics;
      if (analytics.engagement_rate) context += `Engagement Rate: ${analytics.engagement_rate}%\n`;
      if (analytics.avg_likes) context += `Average Likes: ${analytics.avg_likes}\n`;
      if (analytics.avg_comments) context += `Average Comments: ${analytics.avg_comments}\n`;
    }
    
  } catch (error) {
    console.error('[RAG] Error extracting profile context:', error);
    context += "Profile data structure is complex, but available for analysis.";
  }
  
  return context;
}

// Simple, bulletproof Gemini API call
async function callGeminiAPI(prompt, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[RAG] Calling Gemini API (attempt ${attempt})`);
      
      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CONFIG.model}:generateContent?key=${GEMINI_CONFIG.apiKey}`,
        {
          contents: [{
            role: 'user',
            parts: [{ text: prompt }]
          }],
          generationConfig: {
            maxOutputTokens: GEMINI_CONFIG.maxTokens,
            temperature: GEMINI_CONFIG.temperature
          }
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 30000
        }
      );
      
      if (response.data.candidates && response.data.candidates[0] && 
          response.data.candidates[0].content && response.data.candidates[0].content.parts) {
        const text = response.data.candidates[0].content.parts[0].text;
        if (text && text.trim()) {
          console.log(`[RAG] Gemini API success (${text.length} chars)`);
          return text;
        }
      }
      
      throw new Error('Empty response from Gemini API');
      
    } catch (error) {
      console.error(`[RAG] Gemini API error (attempt ${attempt}):`, error.message);
      
      if (attempt === retries) {
        // Return a helpful fallback response
        return "I'm currently experiencing technical difficulties with my AI processing. However, I'm here to help you with your social media strategy. Could you please rephrase your question or ask something specific about your account management needs?";
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// Create RAG-enhanced prompt
function createRAGPrompt(userMessage, profileContext, platform, username) {
  return `You are a professional social media account manager assistant for ${username} on ${platform}. 

PROFILE CONTEXT:
${profileContext}

USER QUESTION: ${userMessage}

INSTRUCTIONS:
- Use the profile context above to provide personalized, specific advice
- Be natural and conversational, like a knowledgeable assistant
- Reference specific metrics, posts, or data when relevant
- Provide actionable recommendations
- Keep responses focused and helpful
- If asked about engagement, use the actual data provided
- Speak as if you're familiar with this specific account

Respond naturally and helpfully:`;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main AI reply endpoint - SIMPLIFIED AND BULLETPROOF
app.post('/ai-reply', async (req, res) => {
  try {
    const { username, platform = 'facebook', message, conversation_history = [] } = req.body;
    
    if (!username || !message) {
      return res.status(400).json({ error: 'Username and message are required' });
    }
    
    console.log(`[RAG] Processing request for ${platform}/${username}: "${message}"`);
    
    // Get profile data
    const profileData = await getProfileData(username.toLowerCase(), platform.toLowerCase());
    const profileContext = extractProfileContext(profileData, platform);
    
    // Create RAG-enhanced prompt
    const prompt = createRAGPrompt(message, profileContext, platform, username);
    
    // Get AI response
    const aiResponse = await callGeminiAPI(prompt);
    
    console.log(`[RAG] Generated response for ${platform}/${username}`);
    
    res.json({
      response: aiResponse,
      timestamp: new Date().toISOString(),
      username,
      platform,
      profile_data_used: !!profileData
    });
    
  } catch (error) {
    console.error('[RAG] Error in ai-reply:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Unable to process your request at this time'
    });
  }
});

// Chat endpoint (alternative name for compatibility)
app.post('/chat', async (req, res) => {
  // Redirect to ai-reply endpoint
  req.url = '/ai-reply';
  return app._router.handle(req, res);
});

// Start server
app.listen(port, () => {
  console.log(`[RAG] 🚀 RAG Server running on port ${port}`);
  console.log(`[RAG] 📊 Profile data caching enabled`);
  console.log(`[RAG] 🤖 Gemini AI integration active`);
  console.log(`[RAG] ✅ Ready for personalized responses`);
});

export default app;
