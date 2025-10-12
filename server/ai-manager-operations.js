/**
 * AI MANAGER BACKEND OPERATIONS - TRULY AGENTIC
 * 
 * REAL OPERATIONS WITH FULL TRANSPARENCY:
 * - Show progress for EVERY file operation
 * - Read actual cached files from disk (no fallbacks)
 * - Map userId to platform-specific usernames correctly
 * - Send to Gemini for intelligent analysis
 * - Detailed logging to prove real-time operations
 */

import fs from 'fs/promises';
import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const GEMINI_API_KEY = 'AIzaSyBjBkmlDCdeDXtvcePtChNppjbuAH9erdc';
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// Absolute cache directory path
const CACHE_DIR = '/home/komail/Accountmanager/data/cache';

// NOTE: s3Client will be passed from server.js to avoid SSL issues
let s3Client = null;

export function initializeS3Client(client) {
  s3Client = client;
  console.log('[AI-Manager] ✅ S3 client initialized');
}

/**
 * Get platform-specific username for userId from R2
 * This MUST work or fail clearly - no guessing
 */
async function getUsernameForPlatform(userId, platform, progressCallback) {
  if (!s3Client) {
    throw new Error('[AI-Manager] S3 client not initialized');
  }
  
  try {
    // Use the EXACT path that /api/user-{platform}-status uses
    // Format: User{Platform}Status/{userId}/status.json
    const platformCapitalized = platform.charAt(0).toUpperCase() + platform.slice(1);
    const key = `User${platformCapitalized}Status/${userId}/status.json`;
    
    progressCallback(`📡 Retrieving ${platform} username from R2 (key: ${key})...`);
    console.log(`[AI-Manager] Fetching username from R2: ${key}`);
    
    const command = new GetObjectCommand({
      Bucket: 'tasks',
      Key: key
    });
    
    const response = await s3Client.send(command);
    const statusData = JSON.parse(await streamToString(response.Body));
    
    const username = statusData[`${platform}_username`];
    if (!username) {
      throw new Error(`No ${platform}_username field in status data`);
    }
    
    progressCallback(`✅ Found ${platform} username: @${username}`);
    console.log(`[AI-Manager] ✅ Retrieved username: @${username} for ${platform}`);
    return username;
    
  } catch (error) {
    console.error(`[AI-Manager] ❌ Failed to get ${platform} username for ${userId}:`, error.message);
    throw new Error(`Could not retrieve ${platform} username: ${error.message}`);
  }
}

/**
 * Read cached profile from disk - with full transparency
 */
async function readCachedProfile(platform, username, progressCallback) {
  const filename = `${platform}_${username}_profile.json`;
  const filepath = path.join(CACHE_DIR, filename);
  
  try {
    progressCallback(`📂 Opening file: ${filename}...`);
    console.log(`[AI-Manager] Reading cached profile: ${filepath}`);
    
    const content = await fs.readFile(filepath, 'utf-8');
    progressCallback(`📖 Parsing profile data for @${username}...`);
    
    const profile = JSON.parse(content);
    progressCallback(`✅ Profile loaded: ${filename}`);
    console.log(`[AI-Manager] ✅ Successfully loaded profile: @${username} (${profile.data?.[0]?.followersCount || 0} followers)`);
    
    return profile;
  } catch (error) {
    console.error(`[AI-Manager] ❌ Could not read ${filename}:`, error.message);
    throw new Error(`Profile file not found: ${filename}. Ensure this account is tracked.`);
  }
}

/**
 * Read news from R2 - with full transparency and NO fallbacks
 */
async function readNewsFromR2(platform, username, progressCallback) {
  try {
    progressCallback(`📰 Fetching trending news for ${platform}/@${username}...`);
    console.log(`[AI-Manager] Fetching news from R2 for ${platform}/@${username}`);
    
    if (!s3Client) {
      throw new Error('S3 client not initialized');
    }
    
    // Read directly from R2 using the ACTUAL path structure
    // News is stored as: news_for_you/{platform}/{username}/news_{timestamp}_{username}.json
    const prefix = `news_for_you/${platform}/${username}/`;
    
    progressCallback(`🔍 Scanning R2 for news files (prefix: ${prefix})...`);
    console.log(`[AI-Manager] Looking for news in R2: ${prefix}`);
    
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: prefix,
      MaxKeys: 10
    });
    
    const listResponse = await s3Client.send(listCommand);
    
    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      throw new Error(`No news files found in R2 for @${username} on ${platform}`);
    }
    
    progressCallback(`📂 Found ${listResponse.Contents.length} news files, reading latest...`);
    console.log(`[AI-Manager] Found ${listResponse.Contents.length} news files for ${username}`);
    
    // Get the most recent news file
    const sortedFiles = listResponse.Contents.sort((a, b) => 
      (b.LastModified?.getTime() || 0) - (a.LastModified?.getTime() || 0)
    );
    
    const latestNewsKey = sortedFiles[0].Key;
    progressCallback(`📖 Reading: ${latestNewsKey}...`);
    
    const getCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: latestNewsKey
    });
    
    const newsResponse = await s3Client.send(getCommand);
    const newsData = JSON.parse(await streamToString(newsResponse.Body));
    
    progressCallback(`✅ News data loaded successfully`);
    console.log(`[AI-Manager] ✅ Loaded news from ${latestNewsKey}`);
    console.log(`[AI-Manager] Full news data:`, JSON.stringify(newsData, null, 2).substring(0, 500));
    
    // Extract news items - HANDLE ALL FORMATS
    let newsItems = [];
    
    // Format 1: Instagram single object { news_data: {...} }
    if (newsData.news_data && !Array.isArray(newsData.news_data)) {
      newsItems = [newsData.news_data];
      console.log(`[AI-Manager] Format: Instagram single news_data object`);
    }
    // Format 2: Twitter array { news_items: [{...}, {...}] }
    else if (Array.isArray(newsData.news_items)) {
      newsItems = newsData.news_items;
      console.log(`[AI-Manager] Format: Twitter news_items array with ${newsItems.length} items`);
    }
    // Format 3: Generic array { news: [...] }
    else if (Array.isArray(newsData.news)) {
      newsItems = newsData.news;
      console.log(`[AI-Manager] Format: Generic news array`);
    }
    // Format 4: Direct array [...]
    else if (Array.isArray(newsData)) {
      newsItems = newsData;
      console.log(`[AI-Manager] Format: Direct array`);
    }
    // Format 5: Nested { data: { news_data: ... } }
    else if (newsData.data?.news_data) {
      newsItems = Array.isArray(newsData.data.news_data) 
        ? newsData.data.news_data 
        : [newsData.data.news_data];
      console.log(`[AI-Manager] Format: Nested data.news_data`);
    }
    
    if (newsItems.length === 0) {
      console.error(`[AI-Manager] ❌ PARSING FAILED - News data structure:`, JSON.stringify(newsData, null, 2));
      throw new Error('News file exists but contains no news items. Check logs for data structure.');
    }
    
    console.log(`[AI-Manager] ✅ Extracted ${newsItems.length} news items`);
    console.log(`[AI-Manager] First item:`, JSON.stringify(newsItems[0], null, 2).substring(0, 300));
    return newsItems.slice(0, 5); // Top 5 news items
    
  } catch (error) {
    console.error(`[AI-Manager] ❌ Error reading news:`, error.message);
    throw new Error(`Failed to fetch news: ${error.message}`);
  }
}

/**
 * AGENTIC OPERATION: Analyze Competitor
 * TRUE TRANSPARENCY: Shows every step of file reading and analysis
 */
export async function analyzeCompetitor(userId, platform, competitorUsername, progressCallback, providedUsername = null) {
  try {
    console.log(`\n[AI-Manager] ===== COMPETITOR ANALYSIS START =====`);
    console.log(`[AI-Manager] UserId: ${userId}, Platform: ${platform}, Competitor: ${competitorUsername}`);
    
    // Step 1: Get user's username from R2 (single source of truth)
    progressCallback(`🔍 Step 1/4: Retrieving your ${platform} username...`);
    const myUsername = await getUsernameForPlatform(userId, platform, progressCallback);
    
    console.log(`[AI-Manager] My username: @${myUsername}`);
    
    // Step 2: Read competitor's cached profile from disk
    progressCallback(`📂 Step 2/4: Reading competitor profile from disk...`);
    const competitorProfile = await readCachedProfile(platform, competitorUsername, progressCallback);
    
    // Extract profile data (structure: { data: [{ ...profile }] })
    const competitorData = competitorProfile.data?.[0] || competitorProfile;
    
    // Step 3: Read your profile from disk
    progressCallback(`📂 Step 3/4: Reading your profile from disk...`);
    const myProfile = await readCachedProfile(platform, myUsername, progressCallback);
    const myData = myProfile.data?.[0] || myProfile;
    
    // Step 4: Send to Gemini for AI analysis
    progressCallback(`🤖 Step 4/4: Analyzing with Gemini AI...`);
    console.log(`[AI-Manager] Sending to Gemini for analysis...`);
    
    const prompt = `You are a social media analytics expert. Analyze this competitor profile and provide actionable insights.

MY PROFILE (@${myUsername}):
${JSON.stringify({
  followers: myData.followersCount || 0,
  following: myData.followsCount || 0,
  posts: myData.postsCount || 0,
  bio: myData.biography || 'No bio'
}, null, 2)}

COMPETITOR PROFILE (@${competitorUsername}):
${JSON.stringify({
  followers: competitorData.followersCount || 0,
  following: competitorData.followsCount || 0,
  posts: competitorData.postsCount || 0,
  bio: competitorData.biography || 'No bio',
  verified: competitorData.verified || false,
  recentPosts: (competitorData.latestPosts || []).slice(0, 5).map(p => ({
    caption: p.caption?.substring(0, 100),
    likes: p.likesCount || 0,
    comments: p.commentsCount || 0
  }))
}, null, 2)}

Provide a concise 2-paragraph analysis covering:
1. Their strategy and strengths
2. What you can learn from them to improve your own account

Be specific, actionable, and insightful. No fluff.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const analysis = result.response.text();
    
    progressCallback('✅ Analysis complete!');
    console.log(`[AI-Manager] ✅ Analysis generated successfully`);
    console.log(`[AI-Manager] ===== COMPETITOR ANALYSIS END =====\n`);
    
    return {
      success: true,
      message: `📊 **Analysis of @${competitorUsername}**\n\n${analysis}\n\n**Stats:**\n• Followers: ${(competitorData.followersCount || 0).toLocaleString()}\n• Posts: ${competitorData.postsCount || 0}\n• Verified: ${competitorData.verified ? '✓' : '✗'}`,
      data: {
        competitor: competitorUsername,
        analysis: analysis
      }
    };
    
  } catch (error) {
    console.error('[AI-Manager] ❌ Competitor analysis error:', error);
    return {
      success: false,
      message: `❌ Analysis failed: ${error.message}`
    };
  }
}

/**
 * AGENTIC OPERATION: Get Trending News Summary
 * TRUE TRANSPARENCY: Shows every step of fetching and analyzing news
 */
export async function getNewsSummary(userId, platform, progressCallback, providedUsername = null) {
  try {
    console.log(`\n[AI-Manager] ===== NEWS SUMMARY START =====`);
    console.log(`[AI-Manager] UserId: ${userId}, Platform: ${platform}`);
    
    // Step 1: Get username from R2 (single source of truth)
    progressCallback(`🔍 Step 1/3: Retrieving your ${platform} username...`);
    const username = await getUsernameForPlatform(userId, platform, progressCallback);
    
    console.log(`[AI-Manager] Username: @${username}`);
    
    // Step 2: Read news from R2
    progressCallback(`📰 Step 2/3: Fetching trending news from R2...`);
    const newsItems = await readNewsFromR2(platform, username, progressCallback);
    
    console.log(`[AI-Manager] Retrieved ${newsItems.length} news items`);
    
    // Step 3: Send to Gemini for summarization
    progressCallback(`🤖 Step 3/3: Generating AI summary with Gemini...`);
    console.log(`[AI-Manager] Sending ${newsItems.length} news items to Gemini...`);
    
    const prompt = `You are a social media news analyst. Summarize these trending news items in a concise, engaging way.

NEWS ITEMS:
${newsItems.map((item, i) => `
${i + 1}. ${item.title || 'Untitled'}
   Source: ${item.source || 'Unknown'}
   Description: ${item.description || item.summary || 'No description'}
`).join('\n')}

Provide:
1. A brief overview (2-3 sentences) of the main trends
2. Top 3 news items with key takeaways

Be concise and actionable.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const summary = result.response.text();
    
    progressCallback('✅ News summary generated!');
    console.log(`[AI-Manager] ✅ Summary generated successfully`);
    console.log(`[AI-Manager] ===== NEWS SUMMARY END =====\n`);
    
    return {
      success: true,
      message: `📰 **Trending News on ${platform.toUpperCase()}**\n\n${summary}`,
      data: {
        newsCount: newsItems.length,
        summary: summary
      }
    };
    
  } catch (error) {
    console.error('[AI-Manager] ❌ News summary error:', error);
    return {
      success: false,
      message: `❌ Failed to get news: ${error.message}`
    };
  }
}

/**
 * AGENTIC OPERATION: Get Overall Competitor Analysis
 * TRUE TRANSPARENCY: NO FALLBACKS - reads real competitor data only
 */
export async function getCompetitorAnalysis(userId, platform, progressCallback, providedUsername = null, frontendCompetitors = null) {
  try {
    console.log(`\n[AI-Manager] ===== COMPETITOR ANALYSIS START =====`);
    console.log(`[AI-Manager] UserId: ${userId}, Platform: ${platform}`);
    
    // Step 1: Get username from R2 (single source of truth)
    progressCallback(`🔍 Step 1/4: Retrieving your ${platform} username...`);
    const username = await getUsernameForPlatform(userId, platform, progressCallback);
    
    console.log(`[AI-Manager] Username: @${username}`);
    
    // Step 2: Read your profile from disk
    progressCallback(`📂 Step 2/4: Reading your profile from disk...`);
    const myProfile = await readCachedProfile(platform, username, progressCallback);
    const myData = myProfile.data?.[0] || myProfile;
    
    // Step 3: Get competitors from profile OR from frontend localStorage
    progressCallback(`🔍 Step 3/4: Finding competitor profiles...`);
    let competitors = myData.relatedProfiles || [];
    
    console.log(`[AI-Manager] Profile relatedProfiles:`, competitors);
    
    // If no competitors in profile, try using ones passed from frontend
    if (competitors.length === 0 && frontendCompetitors && frontendCompetitors.length > 0) {
      console.log(`[AI-Manager] Using ${frontendCompetitors.length} competitors from frontend:`, frontendCompetitors);
      competitors = frontendCompetitors;
      progressCallback(`✅ Using ${frontendCompetitors.length} competitors from your account settings`);
    }
    
    if (competitors.length === 0) {
      throw new Error(`No competitors found in your ${platform} profile. Please re-acquire ${platform} with competitor usernames specified.`);
    }
    
    console.log(`[AI-Manager] Found ${competitors.length} competitors`);
    
    // Step 4: Read competitor profiles from disk
    const competitorProfiles = [];
    for (const comp of competitors.slice(0, 3)) {
      const compUsername = comp.username || comp;
      try {
        progressCallback(`📂 Reading @${compUsername} profile...`);
        const compProfile = await readCachedProfile(platform, compUsername, progressCallback);
        const compData = compProfile.data?.[0] || compProfile;
        competitorProfiles.push({
          username: compUsername,
          ...compData
        });
      } catch (error) {
        console.log(`[AI-Manager] Skipping @${compUsername}: ${error.message}`);
        progressCallback(`⚠️ Could not read @${compUsername}, skipping...`);
      }
    }
    
    if (competitorProfiles.length === 0) {
      throw new Error(`Could not load any competitor profiles. Ensure competitor accounts are being tracked.`);
    }
    
    // Step 5: AI Analysis
    progressCallback(`🤖 Step 4/4: Analyzing competitive landscape with Gemini...`);
    console.log(`[AI-Manager] Analyzing ${competitorProfiles.length} competitors...`);
    
    const prompt = `You are a social media competitive intelligence analyst. Analyze these competitors and provide strategic insights.

MY PROFILE (@${username}):
Followers: ${myData.followersCount || 0}
Posts: ${myData.postsCount || 0}
Bio: ${myData.biography || 'N/A'}

COMPETITORS:
${competitorProfiles.map((comp, i) => `
${i + 1}. @${comp.username}
   Followers: ${comp.followersCount || 0}
   Posts: ${comp.postsCount || 0}
   Bio: ${comp.biography?.substring(0, 100) || 'No bio'}
   Verified: ${comp.verified ? 'Yes' : 'No'}
`).join('\n')}

Provide a 2-paragraph analysis covering:
1. Competitive landscape overview and your position
2. Top 3 actionable strategies to compete effectively

Be specific and strategic.`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const analysis = result.response.text();
    
    progressCallback('✅ Competitive analysis complete!');
    console.log(`[AI-Manager] ✅ Analysis generated successfully`);
    console.log(`[AI-Manager] ===== COMPETITOR ANALYSIS END =====\n`);
    
    return {
      success: true,
      message: `📊 **Competitive Analysis for ${platform.toUpperCase()}**\n\n${analysis}\n\n**Your Stats:**\n• Followers: ${(myData.followersCount || 0).toLocaleString()}\n• Competitors Analyzed: ${competitorProfiles.length}`,
      data: {
        myUsername: username,
        competitors: competitorProfiles.length,
        analysis: analysis
      }
    };
    
  } catch (error) {
    console.error('[AI-Manager] ❌ Competitive analysis error:', error);
    return {
      success: false,
      message: `❌ Analysis failed: ${error.message}`
    };
  }
}

// Utility: Convert stream to string
function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}
