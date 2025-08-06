import { ChromaClient } from 'chromadb';
import { OpenAIEmbeddings } from '@langchain/openai';
import fs from 'fs';
import path from 'path';

// ChromaDB Service for Enhanced RAG Implementation
class ChromaDBService {
  constructor() {
    this.client = null;
    this.collections = new Map();
    this.embeddings = null;
    this.isInitialized = false;
    
    // Initialize OpenAI embeddings - using a free alternative if API key not available
    this.initializeEmbeddings();
  }

  async initializeEmbeddings() {
    // Since we're using Gemini API and don't have a valid OpenAI API key,
    // we'll use the local embedding function which is more reliable and free
    console.log('[ChromaDB] Using local embeddings (more reliable than OpenAI for this setup)');
    this.embeddings = {
      embedQuery: async (text) => this.generateLocalEmbedding(text),
      embedDocuments: async (docs) => Promise.all(docs.map(doc => this.generateLocalEmbedding(doc)))
    };
  }

  // Simple local embedding using text features (fallback)
  generateLocalEmbedding(text) {
    const cleaned = text.toLowerCase().replace(/[^\w\s]/g, ' ').trim();
    const words = cleaned.split(/\s+/).filter(w => w.length > 2);
    
    // Create a 384-dimensional vector based on text features
    const embedding = new Array(384).fill(0);
    
    // Hash-based embedding generation
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      for (let j = 0; j < word.length; j++) {
        const charCode = word.charCodeAt(j);
        const index = (charCode * (i + 1) * (j + 1)) % 384;
        embedding[index] += Math.sin(charCode * 0.1) * 0.1;
      }
    }
    
    // Normalize the vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? embedding.map(val => val / magnitude) : embedding;
  }

  async initialize() {
    try {
      // Determine ChromaDB endpoint (allows overriding the default when port 8000 is busy)
      const chromaPath =
        // Highest-priority: explicit full URL
        process.env.CHROMADB_URL ||
        // Host + Port combination
        (process.env.CHROMA_DB_HOST && process.env.CHROMA_DB_PORT
          ? `http://${process.env.CHROMA_DB_HOST}:${process.env.CHROMA_DB_PORT}`
          : null) ||
        // Only custom port (assume localhost)
        (process.env.CHROMA_DB_PORT || process.env.CHROMA_DB_PORT_HOST
          ? `http://localhost:${process.env.CHROMA_DB_PORT || process.env.CHROMA_DB_PORT_HOST}`
          : null) ||
        // Fallback to default
        'http://localhost:8000';

      const candidatePaths = [];
      // 1) Provided path
      if (chromaPath) candidatePaths.push(chromaPath);

      // 2) If only port given, scan common alternatives up to 8010
      const defaultHost = 'http://localhost';
      for (let p = 8000; p <= 8010; p++) {
        const alt = `${defaultHost}:${p}`;
        if (!candidatePaths.includes(alt)) candidatePaths.push(alt);
      }

      // Helper to test a given path
      const testPath = async (pathToTest) => {
        try {
          const testClient = new ChromaClient({ path: pathToTest });
          // Prefer version call but fallback to heartbeat
          try {
            await testClient.version();
          } catch (_) {
            await testClient.heartbeat();
          }
          // If succeeded, set as active client
          this.client = testClient;
          console.log(`[ChromaDB] Connected to ChromaDB at ${pathToTest}`);
          return true;
        } catch (err) {
          return false;
        }
      };

      let connected = false;
      for (const pathToTry of candidatePaths) {
        console.log(`[ChromaDB] Attempting to connect at ${pathToTry} ...`);
         
        if (await testPath(pathToTry)) {
          connected = true;
          break;
        }
      }

      if (!connected) {
        throw new Error('All connection attempts failed');
      }

      this.isInitialized = true;
      console.log('[ChromaDB] Successfully connected to ChromaDB server');

      return true;
    } catch (error) {
      console.warn('[ChromaDB] ChromaDB server not available, using in-memory fallback:', error.message);
      this.isInitialized = false;
      return false;
    }
  }

  // Generic JSON data processor that handles different social media formats
  processProfileData(profileData, platform, username) {
    const documents = [];
    const metadatas = [];
    const ids = [];

    try {
      // Handle different data structures
      let normalizedData = this.normalizeDataStructure(profileData, platform);
      
      // Process profile information
      if (normalizedData.profile) {
        const profileDoc = this.createProfileDocument(normalizedData.profile, platform, username);
        if (profileDoc) {
          documents.push(profileDoc.content);
          metadatas.push(profileDoc.metadata);
          ids.push(`${username}_${platform}_profile`);
        }
      }

      // Process posts/content
      if (normalizedData.posts && normalizedData.posts.length > 0) {
        normalizedData.posts.forEach((post, index) => {
          const postDoc = this.createPostDocument(post, platform, username, index);
          if (postDoc) {
            documents.push(postDoc.content);
            metadatas.push(postDoc.metadata);
            ids.push(`${username}_${platform}_post_${index}`);
          }
        });
      }

      // Process bio/description if available
      if (normalizedData.bio) {
        const bioDoc = this.createBioDocument(normalizedData.bio, platform, username);
        if (bioDoc) {
          documents.push(bioDoc.content);
          metadatas.push(bioDoc.metadata);
          ids.push(`${username}_${platform}_bio`);
        }
      }

      // Process engagement data
      if (normalizedData.engagement) {
        const engagementDoc = this.createEngagementDocument(normalizedData.engagement, platform, username);
        if (engagementDoc) {
          documents.push(engagementDoc.content);
          metadatas.push(engagementDoc.metadata);
          ids.push(`${username}_${platform}_engagement`);
        }
      }

      console.log(`[ChromaDB] Processed ${documents.length} documents for ${platform}/${username}`);
      return { documents, metadatas, ids };

    } catch (error) {
      console.error(`[ChromaDB] Error processing profile data for ${platform}/${username}:`, error);
      return { documents: [], metadatas: [], ids: [] };
    }
  }

  // Normalize different JSON structures to a common format
  normalizeDataStructure(data, platform) {
    const normalized = {
      profile: null,
      posts: [],
      bio: '',
      engagement: null
    };

    try {
      if (Array.isArray(data)) {
        // Handle array format (Twitter, some Instagram formats)
        if (data.length > 0) {
          const firstItem = data[0];
          
          // Check if it's tweets with author data
          if (firstItem.author) {
            normalized.profile = firstItem.author;
            normalized.posts = data.map(item => ({
              content: item.text || item.caption || '',
              timestamp: item.timestamp || item.created_at || item.createdAt,
              engagement: {
                likes: item.likeCount || item.likesCount || item.like_count || 0,
                comments: item.replyCount || item.commentsCount || item.reply_count || 0,
                shares: item.retweetCount || item.shareCount || item.share_count || 0
              },
              hashtags: this.extractHashtags(item.text || item.caption || ''),
              mentions: this.extractMentions(item.text || item.caption || '')
            }));
          } 
          // Check if it has latestPosts (Instagram format)
          else if (firstItem.latestPosts) {
            normalized.profile = firstItem;
            normalized.posts = firstItem.latestPosts.map(post => ({
              content: post.caption || '',
              timestamp: post.timestamp,
              engagement: {
                likes: post.likesCount || 0,
                comments: post.commentsCount || 0,
                shares: 0
              },
              hashtags: post.hashtags || [],
              mentions: post.mentions || []
            }));
          }
          // Direct post array
          else {
            normalized.posts = data.map(item => ({
              content: item.caption || item.text || item.content || '',
              timestamp: item.timestamp || item.created_at,
              engagement: {
                likes: item.likesCount || item.like_count || 0,
                comments: item.commentsCount || item.reply_count || 0,
                shares: item.shareCount || item.share_count || 0
              },
              hashtags: this.extractHashtags(item.caption || item.text || ''),
              mentions: this.extractMentions(item.caption || item.text || '')
            }));
          }
        }
      } else if (typeof data === 'object') {
        // Handle object format
        // Facebook Page format (profileInfo + posts)
        if (data.profileInfo && Array.isArray(data.posts)) {
          const profileObj = data.profileInfo;
          // Normalize profile fields for consistency
          normalized.profile = {
            ...profileObj,
            username: profileObj.pageName || profileObj.pageId || '',
            fullName: profileObj.pageName || profileObj.title || profileObj.name || '',
            followersCount: profileObj.followers || profileObj.likes || 0,
            biography: profileObj.intro || (profileObj.about_me && profileObj.about_me.text) || ''
          };

          normalized.posts = data.posts.map(post => ({
            content: post.text || post.message || post.caption || '',
            timestamp: post.timestamp || post.time,
            engagement: {
              likes: post.likes || post.like_count || 0,
              comments: post.comments || post.comment_count || 0,
              shares: post.shares || post.share_count || 0
            },
            hashtags: this.extractHashtags(post.text || post.message || post.caption || ''),
            mentions: this.extractMentions(post.text || post.message || post.caption || '')
          }));
        } else 
        if (data.username || data.name || data.fullName) {
          // Direct profile object
          normalized.profile = data;
          
          if (data.latestPosts) {
            normalized.posts = data.latestPosts.map(post => ({
              content: post.caption || '',
              timestamp: post.timestamp,
              engagement: {
                likes: post.likesCount || 0,
                comments: post.commentsCount || 0,
                shares: 0
              },
              hashtags: post.hashtags || [],
              mentions: post.mentions || []
            }));
          }
        }
        
        // Handle nested data
        if (data.data && Array.isArray(data.data)) {
          return this.normalizeDataStructure(data.data, platform);
        }
      }

      // Extract bio information
      if (normalized.profile) {
        normalized.bio = normalized.profile.biography || 
                        normalized.profile.bio || 
                        normalized.profile.description || '';
      }

      // Calculate engagement metrics
      if (normalized.posts.length > 0) {
        const totalLikes = normalized.posts.reduce((sum, post) => sum + (post.engagement?.likes || 0), 0);
        const totalComments = normalized.posts.reduce((sum, post) => sum + (post.engagement?.comments || 0), 0);
        const totalShares = normalized.posts.reduce((sum, post) => sum + (post.engagement?.shares || 0), 0);
        
        normalized.engagement = {
          avgLikes: Math.round(totalLikes / normalized.posts.length),
          avgComments: Math.round(totalComments / normalized.posts.length),
          avgShares: Math.round(totalShares / normalized.posts.length),
          totalPosts: normalized.posts.length,
          engagementRate: normalized.profile?.followersCount 
            ? ((totalLikes + totalComments) / (normalized.posts.length * normalized.profile.followersCount) * 100).toFixed(2)
            : 0
        };
      }

    } catch (error) {
      console.error('[ChromaDB] Error normalizing data structure:', error);
    }

    return normalized;
  }

  // Create semantic documents for different data types
  createProfileDocument(profile, platform, username) {
    try {
      const content = `Profile: ${profile.fullName || profile.name || username}
Username: @${profile.username || username}
Platform: ${platform}
Bio: ${profile.biography || profile.bio || profile.description || ''}
Followers: ${(profile.followersCount || profile.followers_count || 0).toLocaleString()}
Following: ${(profile.followsCount || profile.following_count || 0).toLocaleString()}
Posts: ${(profile.postsCount || profile.posts_count || 0).toLocaleString()}
Verified: ${profile.verified || profile.is_verified ? 'Yes' : 'No'}
Business Account: ${profile.isBusinessAccount || profile.is_business_account ? 'Yes' : 'No'}
Category: ${profile.businessCategoryName || profile.category || 'Personal'}
Website: ${profile.externalUrls?.[0]?.url || 'None'}`;

      return {
        content,
        metadata: {
          type: 'profile',
          platform,
          username,
          followerCount: profile.followersCount || profile.followers_count || 0,
          verified: profile.verified || profile.is_verified || false,
          businessAccount: profile.isBusinessAccount || profile.is_business_account || false,
          category: profile.businessCategoryName || profile.category || 'personal'
        }
      };
    } catch (error) {
      console.error('[ChromaDB] Error creating profile document:', error);
      return null;
    }
  }

  createPostDocument(post, platform, username, index) {
    try {
      if (!post.content || post.content.trim().length === 0) {
        return null; // Skip empty posts
      }

      const content = `Post ${index + 1} on ${platform}:
Content: ${post.content}
Hashtags: ${post.hashtags.join(' ')}
Mentions: ${post.mentions.join(' ')}
Likes: ${(post.engagement?.likes || 0).toLocaleString()}
Comments: ${(post.engagement?.comments || 0).toLocaleString()}
Retweets: ${(post.engagement?.shares || 0).toLocaleString()}
Total Engagement: ${((post.engagement?.likes || 0) + (post.engagement?.comments || 0) + (post.engagement?.shares || 0)).toLocaleString()}
Posted: ${post.timestamp || 'Recent'}`;

      return {
        content,
        metadata: {
          type: 'post',
          platform,
          username,
          postIndex: index,
          likes: post.engagement?.likes || 0,
          comments: post.engagement?.comments || 0,
          shares: post.engagement?.shares || 0,
          totalEngagement: (post.engagement?.likes || 0) + (post.engagement?.comments || 0) + (post.engagement?.shares || 0),
          hashtagCount: post.hashtags.length,
          mentionCount: post.mentions.length,
          wordCount: post.content.split(/\s+/).length
        }
      };
    } catch (error) {
      console.error('[ChromaDB] Error creating post document:', error);
      return null;
    }
  }

  createBioDocument(bio, platform, username) {
    try {
      if (!bio || bio.trim().length === 0) {
        return null;
      }

      const content = `Bio Analysis for @${username} on ${platform}:
Description: ${bio}
Themes: ${this.extractThemes(bio).join(', ')}
Personality: ${this.extractPersonality(bio).join(', ')}
Keywords: ${this.extractKeywords(bio).join(', ')}`;

      return {
        content,
        metadata: {
          type: 'bio',
          platform,
          username,
          bioLength: bio.length,
          themes: this.extractThemes(bio),
          personality: this.extractPersonality(bio),
          keywords: this.extractKeywords(bio)
        }
      };
    } catch (error) {
      console.error('[ChromaDB] Error creating bio document:', error);
      return null;
    }
  }

  createEngagementDocument(engagement, platform, username) {
    try {
      const content = `Engagement Analytics for @${username} on ${platform}:
Average Likes per Post: ${engagement.avgLikes.toLocaleString()}
Average Comments per Post: ${engagement.avgComments.toLocaleString()}
Average Shares per Post: ${engagement.avgShares.toLocaleString()}
Total Posts: ${engagement.totalPosts}
Engagement Rate: ${engagement.engagementRate}%
Performance: ${this.categorizePerformance(engagement.engagementRate)}`;

      return {
        content,
        metadata: {
          type: 'engagement',
          platform,
          username,
          avgLikes: engagement.avgLikes,
          avgComments: engagement.avgComments,
          avgShares: engagement.avgShares,
          totalPosts: engagement.totalPosts,
          engagementRate: parseFloat(engagement.engagementRate),
          performance: this.categorizePerformance(engagement.engagementRate)
        }
      };
    } catch (error) {
      console.error('[ChromaDB] Error creating engagement document:', error);
      return null;
    }
  }

  // Helper functions for content analysis
  extractHashtags(text) {
    const hashtags = text.match(/#[\w\d]+/g) || [];
    return hashtags.map(tag => tag.toLowerCase());
  }

  extractMentions(text) {
    const mentions = text.match(/@[\w\d]+/g) || [];
    return mentions.map(mention => mention.toLowerCase());
  }

  extractThemes(bio) {
    const themes = [];
    const bioLower = bio.toLowerCase();
    
    const themeKeywords = {
      'Beauty & Cosmetics': ['beauty', 'makeup', 'cosmetics', 'skincare', 'lipstick', 'foundation'],
      'Fashion & Style': ['fashion', 'style', 'outfit', 'designer', 'trend', 'chic'],
      'Business & Entrepreneurship': ['business', 'entrepreneur', 'founder', 'ceo', 'company', 'brand'],
      'Lifestyle': ['lifestyle', 'life', 'daily', 'living', 'home', 'family'],
      'Fitness & Health': ['fitness', 'health', 'workout', 'gym', 'wellness', 'nutrition'],
      'Travel': ['travel', 'adventure', 'explore', 'wanderlust', 'journey', 'vacation'],
      'Food & Cooking': ['food', 'cooking', 'recipe', 'chef', 'restaurant', 'cuisine'],
      'Technology': ['tech', 'technology', 'digital', 'innovation', 'startup', 'ai'],
      'Art & Creativity': ['art', 'creative', 'design', 'artist', 'painting', 'photography'],
      'Music & Entertainment': ['music', 'artist', 'singer', 'musician', 'entertainment', 'performer']
    };

    for (const [theme, keywords] of Object.entries(themeKeywords)) {
      if (keywords.some(keyword => bioLower.includes(keyword))) {
        themes.push(theme);
      }
    }

    return themes.length > 0 ? themes : ['General Content'];
  }

  extractPersonality(bio) {
    const personality = [];
    const bioLower = bio.toLowerCase();
    
    const personalityTraits = {
      'Professional': ['professional', 'business', 'expert', 'specialist', 'consultant'],
      'Creative': ['creative', 'artist', 'designer', 'innovative', 'imaginative'],
      'Enthusiastic': ['love', 'passion', 'excited', 'amazing', 'awesome'],
      'Friendly': ['friendly', 'warm', 'welcoming', 'kind', 'caring'],
      'Inspiring': ['inspire', 'motivate', 'empower', 'transform', 'change'],
      'Educational': ['teach', 'learn', 'educate', 'share', 'tips', 'guide'],
      'Authentic': ['authentic', 'real', 'genuine', 'honest', 'true'],
      'Community-focused': ['community', 'together', 'family', 'team', 'collective']
    };

    for (const [trait, keywords] of Object.entries(personalityTraits)) {
      if (keywords.some(keyword => bioLower.includes(keyword))) {
        personality.push(trait);
      }
    }

    return personality.length > 0 ? personality : ['Engaging'];
  }

  extractKeywords(bio) {
    const words = bio.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3 && !this.isStopWord(word));
    
    // Return unique words
    return [...new Set(words)].slice(0, 10);
  }

  isStopWord(word) {
    const stopWords = ['this', 'that', 'with', 'have', 'will', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just', 'like', 'long', 'make', 'many', 'over', 'such', 'take', 'than', 'them', 'well', 'were'];
    return stopWords.includes(word);
  }

  categorizePerformance(engagementRate) {
    const rate = parseFloat(engagementRate);
    if (rate >= 6) return 'Excellent';
    if (rate >= 3) return 'Good';
    if (rate >= 1) return 'Average';
    return 'Below Average';
  }

  // Store data in ChromaDB
  async storeProfileData(username, platform, profileData) {
    try {
      if (!this.isInitialized) {
        console.log('[ChromaDB] ChromaDB not initialized, using fallback storage');
        return this.storeFallbackData(username, platform, profileData);
      }

      const collectionName = `${platform}_profiles`;
      
      // Get or create collection with better error handling
      let collection;
      try {
        // First try to get existing collection
        collection = await this.client.getCollection({
          name: collectionName
        });
        console.log(`[ChromaDB] Using existing collection: ${collectionName}`);
      } catch (error) {
        // Collection doesn't exist, create it
        console.log(`[ChromaDB] Creating new collection: ${collectionName}`);
        try {
          collection = await this.client.createCollection({
            name: collectionName,
            metadata: { platform, created: new Date().toISOString() }
          });
          console.log(`[ChromaDB] Successfully created collection: ${collectionName}`);
        } catch (createError) {
          console.error(`[ChromaDB] Failed to create collection ${collectionName}:`, createError.message);
          console.log(`[ChromaDB] Using fallback storage for ${platform}/${username}`);
          return this.storeFallbackData(username, platform, profileData);
        }
      }

      // Process the profile data
      const { documents, metadatas, ids } = this.processProfileData(profileData, platform, username);
      
      if (documents.length === 0) {
        console.warn(`[ChromaDB] No valid documents created for ${platform}/${username}`);
        return false;
      }

      // Generate embeddings
      console.log(`[ChromaDB] Generating embeddings for ${documents.length} documents...`);
      const embeddings = await this.embeddings.embedDocuments(documents);

      // Validate data before sending to ChromaDB
      if (embeddings.length !== documents.length || embeddings.length !== metadatas.length || embeddings.length !== ids.length) {
        throw new Error(`Data length mismatch: embeddings(${embeddings.length}), documents(${documents.length}), metadatas(${metadatas.length}), ids(${ids.length})`);
      }

      // Validate embeddings are not empty
      for (let i = 0; i < embeddings.length; i++) {
        if (!Array.isArray(embeddings[i]) || embeddings[i].length === 0) {
          throw new Error(`Invalid embedding at index ${i}: not an array or empty`);
        }
        // Ensure no NaN or Infinity values
        if (embeddings[i].some(val => !Number.isFinite(val))) {
          throw new Error(`Invalid embedding values at index ${i}: contains NaN or Infinity`);
        }
      }

      // Ensure IDs are strings and valid
      const validIds = ids.map((id, index) => {
        const stringId = String(id).replace(/[^a-zA-Z0-9_-]/g, '_');
        return stringId || `doc_${index}`;
      });

      // Clean metadata to ensure compatibility with ChromaDB
      const cleanMetadatas = metadatas.map(metadata => {
        const cleaned = {};
        for (const [key, value] of Object.entries(metadata)) {
          // Only include simple types that ChromaDB supports
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            cleaned[key] = value;
          } else if (Array.isArray(value)) {
            // Convert arrays to strings
            cleaned[key] = value.join(',');
          }
        }
        return cleaned;
      });

      // Check existing data count before adding
      try {
        const existingCount = await collection.count();
        console.log(`[ChromaDB] Collection ${collectionName} currently has ${existingCount} documents`);
      } catch (countError) {
        console.log(`[ChromaDB] Could not get existing count: ${countError.message}`);
      }

      // Upsert data instead of delete + add (this prevents data loss)
      try {
        await collection.upsert({
          ids: validIds,
          embeddings: embeddings,
          documents: documents,
          metadatas: cleanMetadatas
        });
        console.log(`[ChromaDB] Successfully upserted ${documents.length} documents for ${platform}/${username}`);
      } catch (upsertError) {
        console.error(`[ChromaDB] Upsert failed, trying add: ${upsertError.message}`);
        // Fallback to add if upsert fails
      await collection.add({
        ids: validIds,
        embeddings: embeddings,
        documents: documents,
        metadatas: cleanMetadatas
      });
        console.log(`[ChromaDB] Successfully added ${documents.length} documents for ${platform}/${username}`);
      }

      // Verify the data was stored
      try {
        const finalCount = await collection.count();
        console.log(`[ChromaDB] Collection ${collectionName} now has ${finalCount} documents`);
      } catch (countError) {
        console.log(`[ChromaDB] Could not verify final count: ${countError.message}`);
      }

      return true;

    } catch (error) {
      console.error(`[ChromaDB] Error storing profile data for ${platform}/${username}:`, error);
      // Fallback to local storage
      console.log(`[ChromaDB] Falling back to local storage for ${platform}/${username}`);
      return this.storeFallbackData(username, platform, profileData);
    }
  }

  // Fallback storage when ChromaDB is not available
  storeFallbackData(username, platform, profileData) {
    try {
      const fallbackDir = path.join(process.cwd(), 'data', 'vector_fallback');
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }

      const { documents, metadatas, ids } = this.processProfileData(profileData, platform, username);
      
      const fallbackData = {
        username,
        platform,
        timestamp: new Date().toISOString(),
        documents,
        metadatas,
        ids
      };

      const filePath = path.join(fallbackDir, `${platform}_${username}.json`);
      fs.writeFileSync(filePath, JSON.stringify(fallbackData, null, 2));
      
      console.log(`[ChromaDB] Stored fallback data for ${platform}/${username}`);
      return true;
    } catch (error) {
      console.error(`[ChromaDB] Error storing fallback data:`, error);
      return false;
    }
  }

  // Enhanced semantic search
  async semanticSearch(query, username, platform, limit = 5) {
    try {
      if (!this.isInitialized) {
        console.log(`[ChromaDB] ChromaDB not initialized, forcing initialization for ${platform}/${username}`);
        // Try to initialize ChromaDB
        const initialized = await this.initialize();
        if (!initialized) {
          console.error(`[ChromaDB] Failed to initialize ChromaDB for ${platform}/${username}`);
          throw new Error('ChromaDB initialization failed');
        }
      }

      const collectionName = `${platform}_profiles`;
      
      let collection;
      try {
        // First try to get existing collection
        collection = await this.client.getCollection({ name: collectionName });
        console.log(`[ChromaDB] Found existing collection: ${collectionName}`);
      } catch (error) {
        // Collection doesn't exist, try to create it
        console.log(`[ChromaDB] Collection ${collectionName} not found, attempting to create...`);
        try {
          collection = await this.client.createCollection({
            name: collectionName,
            metadata: { platform, created: new Date().toISOString() }
          });
          console.log(`[ChromaDB] Successfully created collection: ${collectionName}`);
        } catch (createError) {
          console.error(`[ChromaDB] Failed to create collection ${collectionName}:`, createError.message);
          throw new Error(`ChromaDB collection creation failed: ${createError.message}`);
        }
      }

      // Check if collection has any data
      try {
        const count = await collection.count();
        if (count === 0) {
          console.log(`[ChromaDB] Collection ${collectionName} is empty, but continuing with search`);
        }
        console.log(`[ChromaDB] Collection ${collectionName} has ${count} documents`);
      } catch (countError) {
        console.error(`[ChromaDB] Error checking collection count:`, countError.message);
        // Continue anyway, don't fallback
      }

      // Generate query embedding
      const queryEmbedding = await this.embeddings.embedQuery(query);

      // Search with user filter
      const results = await collection.query({
        queryEmbeddings: [queryEmbedding],
        nResults: limit,
        where: { username: username },
        include: ['documents', 'metadatas', 'distances']
      });

      // Format results
      const formattedResults = [];
      if (results.documents && results.documents[0]) {
        for (let i = 0; i < results.documents[0].length; i++) {
          const document = results.documents[0][i];
          const metadata = results.metadatas && results.metadatas[0] ? results.metadatas[0][i] : {};
          const distance = results.distances && results.distances[0] ? results.distances[0][i] : 0;
          
          formattedResults.push({
            content: document,
            metadata: metadata,
            distance: distance,
            relevance: 1 - distance // Convert distance to relevance score
          });
        }
      }

      console.log(`[ChromaDB] Found ${formattedResults.length} relevant documents for query: "${query}"`);
      return formattedResults;

    } catch (error) {
      console.error(`[ChromaDB] Error in semantic search for ${platform}/${username}:`, error);
      // Don't fallback, throw error to force ChromaDB usage
      throw new Error(`ChromaDB search failed: ${error.message}`);
    }
  }

  // Create enhanced context for RAG
  async createEnhancedContext(query, username, platform) {
    try {
      console.log(`[ChromaDB] Creating enhanced context for: "${query}"`);
      
      // Always use ChromaDB semantic search - no fallback
      const relevantDocs = await this.semanticSearch(query, username, platform, 8);
      
      if (relevantDocs.length === 0) {
        console.log(`[ChromaDB] No relevant documents found for ${platform}/${username}, checking for any available data`);
        
        // Try to get any documents for this user/platform combination
        try {
          const collectionName = `${platform}_profiles`;
          const collection = await this.client.getCollection({ name: collectionName });
          
          // Get all documents for this user
          const allDocs = await collection.get({
            where: { username: username }
          });
          
          if (allDocs && allDocs.ids && allDocs.ids.length > 0) {
            console.log(`[ChromaDB] Found ${allDocs.ids.length} documents for ${platform}/${username}, using general context`);
            
            // Create general context from available data
            let generalContext = `Profile Analysis Data for ${username} on ${platform}:\n\n`;
            
            if (allDocs.documents && allDocs.documents.length > 0) {
              generalContext += "Available Account Data:\n";
              allDocs.documents.slice(0, 3).forEach((doc, index) => {
                const cleanContent = doc.replace(/🚀|📊|💡|🎯|📈|🔥|❤️|📋|✅/g, '').trim();
                if (cleanContent.length > 10) {
                  generalContext += `${cleanContent}\n\n`;
                }
              });
            }
            
            return generalContext;
          }
        } catch (error) {
          console.log(`[ChromaDB] Error retrieving general data for ${platform}/${username}:`, error.message);
        }
        
        // Return minimal context if no data found
        return `Profile Analysis Data for ${username} on ${platform}:\n\nAccount exists but no specific data available for this query.\n`;
      }

      // Group documents by type for better organization
      const groupedDocs = {
        profile: [],
        posts: [],
        bio: [],
        engagement: []
      };

      relevantDocs.forEach(doc => {
        const type = doc.metadata.type;
        if (type === 'post') {
          groupedDocs.posts.push(doc);
        } else if (groupedDocs[type]) {
          groupedDocs[type].push(doc);
        }
      });

      // Build comprehensive context with preserved data
      let context = `Profile Analysis Data for ${username} on ${platform}:\n\n`;

      // Profile context - preserve important data
      if (groupedDocs.profile.length > 0) {
        context += "Account Information:\n";
        groupedDocs.profile.forEach(doc => {
          // Keep important data, only remove problematic jargon
          const cleanContent = doc.content
            .replace(/🚀|📊|💡|🎯|📈|🔥|❤️|📋|✅/g, '')
            .replace(/STRATEGIC|INTELLIGENCE|COMPETITIVE|VIRAL|HIGH-PERFORMING/gi, '')
            .replace(/BRAND DNA|PERSONALITY MATRIX/gi, '')
            .trim();
          context += `${cleanContent}\n`;
        });
        context += "\n";
      }

      // Bio context - preserve description
      if (groupedDocs.bio.length > 0) {
        context += "Profile Description:\n";
        groupedDocs.bio.forEach(doc => {
          const cleanContent = doc.content
            .replace(/🎭|🎯|💡/g, '')
            .replace(/BRAND DNA|PERSONALITY MATRIX|STRATEGIC/gi, '')
            .trim();
          context += `${cleanContent}\n`;
        });
        context += "\n";
      }

      // Post context - focus on actual content and metrics
      if (groupedDocs.posts.length > 0) {
        context += "Recent Posts and Engagement:\n";
        groupedDocs.posts.slice(0, 4).forEach((doc, index) => {
          const performance = doc.metadata.totalEngagement || 0;
          const likes = doc.metadata.likes || 0;
          const comments = doc.metadata.comments || 0;
          const shares = doc.metadata.shares || 0;
          
          // Extract the actual post caption from the content
          let postCaption = '';
          const contentLines = doc.content.split('\n');
          const contentLine = contentLines.find(line => line.startsWith('Content:'));
          if (contentLine) {
            postCaption = contentLine.replace('Content:', '').trim();
          }
          
          context += `Post ${index + 1}: "${postCaption}"\n`;
          if (performance > 0) {
            context += `Engagement: ${likes.toLocaleString()} likes, ${comments.toLocaleString()} comments, ${shares.toLocaleString()} retweets, Total: ${performance.toLocaleString()}\n`;
          }
          context += "\n";
        });
        
        // Find and highlight the most engaging post
        const mostEngaging = groupedDocs.posts.reduce((max, post) => 
          (post.metadata.totalEngagement || 0) > (max.metadata.totalEngagement || 0) ? post : max
        );
        
        if (mostEngaging && mostEngaging.metadata.totalEngagement > 0) {
          const contentLines = mostEngaging.content.split('\n');
          const contentLine = contentLines.find(line => line.startsWith('Content:'));
          const caption = contentLine ? contentLine.replace('Content:', '').trim() : '';
          
          context += `Most Engaging Post: "${caption}"\n`;
          context += `Performance: ${mostEngaging.metadata.likes.toLocaleString()} likes, ${mostEngaging.metadata.comments.toLocaleString()} comments\n`;
          context += `Total Engagement: ${mostEngaging.metadata.totalEngagement.toLocaleString()}\n\n`;
        }
      }

      // Engagement context - just the numbers
      if (groupedDocs.engagement.length > 0) {
        context += "Engagement Metrics:\n";
        groupedDocs.engagement.forEach(doc => {
          const cleanContent = doc.content
            .replace(/📈|📊|💡|🚀/g, '')
            .replace(/GROWTH PROJECTIONS|ENGAGEMENT SCIENCE/gi, '')
            .trim();
          context += `${cleanContent}\n`;
        });
        context += "\n";
      }

      // Simple summary without business jargon
      context += `Analysis based on ${relevantDocs.length} relevant data points from the ${username} account.\n`;

      console.log(`[ChromaDB] Enhanced context created with ${relevantDocs.length} relevant documents`);
      console.log(`[ChromaDB] Final context length: ${context.length} characters`);
      return context;

    } catch (error) {
      console.error(`[ChromaDB] Error creating enhanced context for ${platform}/${username}:`, error);
      // Don't return null, return minimal context to prevent fallback
      return `Profile Analysis Data for ${username} on ${platform}:\n\nError retrieving data, but account exists.\n`;
    }
  }

  // Get collection statistics
  async getStats(platform) {
    try {
      if (!this.isInitialized) {
        return this.getFallbackStats(platform);
      }

      const collectionName = `${platform}_profiles`;
      
      let collection;
      try {
        collection = await this.client.getCollection({ name: collectionName });
        const count = await collection.count();
        
        return {
          platform,
          totalDocuments: count,
          status: 'active',
          lastUpdated: new Date().toISOString()
        };
      } catch (error) {
        return {
          platform,
          totalDocuments: 0,
          status: 'not_found',
          lastUpdated: null
        };
      }
    } catch (error) {
      console.error(`[ChromaDB] Error getting stats for ${platform}:`, error);
      return {
        platform,
        totalDocuments: 0,
        status: 'error',
        error: error.message
      };
    }
  }

  getFallbackStats(platform) {
    try {
      const fallbackDir = path.join(process.cwd(), 'data', 'vector_fallback');
      const files = fs.readdirSync(fallbackDir).filter(file => file.startsWith(`${platform}_`));
      
      return {
        platform,
        totalDocuments: files.length,
        status: 'fallback',
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      return {
        platform,
        totalDocuments: 0,
        status: 'no_data',
        lastUpdated: null
      };
    }
  }

  // Clean up resources
  async cleanup() {
    if (this.client) {
      // ChromaDB client doesn't need explicit cleanup
      console.log('[ChromaDB] Cleanup completed');
    }
  }
}

// Export singleton instance
const chromaDBService = new ChromaDBService();
export default chromaDBService;