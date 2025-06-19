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
      this.client = new ChromaClient({
        path: 'http://localhost:8000' // Default ChromaDB server
      });
      
      console.log('[ChromaDB] Attempting to connect to ChromaDB server...');
      
      // Test connection using version call instead of heartbeat for newer ChromaDB versions
      try {
        const version = await this.client.version();
        console.log(`[ChromaDB] Connected to ChromaDB version: ${version}`);
      } catch (versionError) {
        // Fallback to heartbeat for older versions
        await this.client.heartbeat();
        console.log('[ChromaDB] Connected using heartbeat (older API)');
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
              timestamp: item.timestamp || item.created_at,
              engagement: {
                likes: item.likesCount || item.like_count || 0,
                comments: item.commentsCount || item.reply_count || 0,
                shares: item.retweetCount || item.share_count || 0
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
Engagement: ${((post.engagement?.likes || 0) + (post.engagement?.comments || 0)).toLocaleString()}
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
          totalEngagement: (post.engagement?.likes || 0) + (post.engagement?.comments || 0),
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
      
      // Get or create collection
      let collection;
      try {
        collection = await this.client.getCollection({
          name: collectionName
        });
      } catch (error) {
        collection = await this.client.createCollection({
          name: collectionName,
          metadata: { platform, created: new Date().toISOString() }
        });
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

      // Delete existing data for this user if any
      try {
        await collection.delete({
          where: { username: username }
        });
      } catch (error) {
        // Collection might be empty, continue
      }

      // Add new documents with validated data
      await collection.add({
        ids: validIds,
        embeddings: embeddings,
        documents: documents,
        metadatas: cleanMetadatas
      });

      console.log(`[ChromaDB] Successfully stored ${documents.length} documents for ${platform}/${username}`);
      return true;

    } catch (error) {
      console.error(`[ChromaDB] Error storing profile data for ${platform}/${username}:`, error);
      return false;
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
        return this.fallbackSearch(query, username, platform, limit);
      }

      const collectionName = `${platform}_profiles`;
      
      let collection;
      try {
        collection = await this.client.getCollection({ name: collectionName });
      } catch (error) {
        console.log(`[ChromaDB] Collection ${collectionName} not found`);
        return [];
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
          formattedResults.push({
            content: results.documents[0][i],
            metadata: results.metadatas[0][i],
            similarity: 1 - results.distances[0][i], // Convert distance to similarity
            relevance: this.calculateRelevance(query, results.documents[0][i], results.metadatas[0][i])
          });
        }
      }

      // Sort by relevance score
      formattedResults.sort((a, b) => b.relevance - a.relevance);

      console.log(`[ChromaDB] Found ${formattedResults.length} relevant documents for query: "${query}"`);
      return formattedResults;

    } catch (error) {
      console.error(`[ChromaDB] Error in semantic search:`, error);
      return this.fallbackSearch(query, username, platform, limit);
    }
  }

  // Fallback search when ChromaDB is not available
  fallbackSearch(query, username, platform, limit = 5) {
    try {
      const fallbackPath = path.join(process.cwd(), 'data', 'vector_fallback', `${platform}_${username}.json`);
      
      if (!fs.existsSync(fallbackPath)) {
        console.log(`[ChromaDB] No fallback data found for ${platform}/${username}`);
        return [];
      }

      const data = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
      const queryLower = query.toLowerCase();
      
      // Simple text-based matching for fallback
      const results = [];
      for (let i = 0; i < data.documents.length; i++) {
        const document = data.documents[i];
        const metadata = data.metadatas[i];
        
        const relevance = this.calculateTextRelevance(queryLower, document.toLowerCase());
        if (relevance > 0.1) { // Minimum relevance threshold
          results.push({
            content: document,
            metadata: metadata,
            similarity: relevance,
            relevance: relevance
          });
        }
      }

      results.sort((a, b) => b.relevance - a.relevance);
      return results.slice(0, limit);

    } catch (error) {
      console.error(`[ChromaDB] Error in fallback search:`, error);
      return [];
    }
  }

  // Calculate relevance score for ranking
  calculateRelevance(query, document, metadata) {
    let score = 0;
    const queryLower = query.toLowerCase();
    const docLower = document.toLowerCase();

    // Exact keyword matches
    const queryWords = queryLower.split(/\s+/);
    const docWords = docLower.split(/\s+/);
    
    for (const word of queryWords) {
      if (docWords.includes(word)) {
        score += 0.3;
      }
    }

    // Metadata relevance
    if (metadata.type === 'profile' && queryLower.includes('profile')) score += 0.2;
    if (metadata.type === 'post' && queryLower.includes('post')) score += 0.2;
    if (metadata.type === 'engagement' && queryLower.includes('engagement')) score += 0.2;
    if (metadata.type === 'bio' && queryLower.includes('bio')) score += 0.2;

    // Engagement-based scoring
    if (metadata.totalEngagement > 1000) score += 0.1;
    if (metadata.verified) score += 0.05;
    if (metadata.businessAccount) score += 0.05;

    return Math.min(score, 1.0); // Cap at 1.0
  }

  calculateTextRelevance(query, document) {
    const queryWords = query.split(/\s+/);
    const docWords = document.split(/\s+/);
    
    let matches = 0;
    for (const word of queryWords) {
      if (docWords.some(docWord => docWord.includes(word) || word.includes(docWord))) {
        matches++;
      }
    }
    
    return matches / queryWords.length;
  }

  // Create enhanced context for RAG
  async createEnhancedContext(query, username, platform) {
    try {
      console.log(`[ChromaDB] Creating enhanced context for: "${query}"`);
      
      // Get relevant documents through semantic search
      const relevantDocs = await this.semanticSearch(query, username, platform, 8);
      
      if (relevantDocs.length === 0) {
        console.log(`[ChromaDB] No relevant documents found for ${platform}/${username}`);
        return null;
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

      // Build clean, academic context without triggering language
      let context = `Profile Analysis Data for ${username} on ${platform}:\n\n`;

      // Profile context - clean format
      if (groupedDocs.profile.length > 0) {
        context += "Account Information:\n";
        groupedDocs.profile.forEach(doc => {
          // Clean the content of any business jargon
          const cleanContent = doc.content
            .replace(/🚀|📊|💡|🎯|📈|🔥|❤️|📋|✅/g, '')
            .replace(/STRATEGIC|INTELLIGENCE|COMPETITIVE|VIRAL|HIGH-PERFORMING/gi, '')
            .replace(/OPPORTUNITIES|BRAND PARTNERSHIPS|MONETIZATION/gi, '')
            .trim();
          context += `${cleanContent}\n`;
        });
        context += "\n";
      }

      // Bio context - simple format
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
          
          // Extract the actual post caption from the content
          let postCaption = '';
          const contentLines = doc.content.split('\n');
          const contentLine = contentLines.find(line => line.startsWith('Content:'));
          if (contentLine) {
            postCaption = contentLine.replace('Content:', '').trim();
          }
          
          context += `Post ${index + 1}: "${postCaption}"\n`;
          if (performance > 0) {
            context += `Engagement: ${likes.toLocaleString()} likes, ${comments.toLocaleString()} comments, Total: ${performance.toLocaleString()}\n`;
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
      return context;

    } catch (error) {
      console.error(`[ChromaDB] Error creating enhanced context:`, error);
      return null;
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