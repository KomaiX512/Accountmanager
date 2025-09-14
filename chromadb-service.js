import axios from 'axios';
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

  // Robust content sanitization for ChromaDB JSON compatibility
  sanitizeForChromaDB(content) {
    if (!content || typeof content !== 'string') return '';
    
    try {
      // Remove or escape problematic characters
      let sanitized = content
        // Remove control characters except newlines and tabs
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        // Fix common Unicode issues
        .replace(/[\uD800-\uDFFF]/g, '') // Remove unpaired surrogates
        // Escape backslashes that might break JSON
        .replace(/\\/g, '\\\\')
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        .trim();
      
      // Test if it's valid JSON-serializable
      JSON.stringify(sanitized);
      
      return sanitized;
    } catch (error) {
      console.warn(`[ChromaDB] Content sanitization failed, using fallback:`, error.message);
      // Fallback: only keep ASCII printable characters and basic punctuation
      return content.replace(/[^\x20-\x7E]/g, '').slice(0, 1000);
    }
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
      // Use environment variable or default to port 8000 (force IPv4)
      this.baseURL = process.env.CHROMADB_URL || 'http://127.0.0.1:8000';
      
      console.log(`[ChromaDB] Connecting to ChromaDB at ${this.baseURL}...`);
      
      // Test connection with direct HTTP request
      const response = await axios.get(`${this.baseURL}/api/v2/version`, { timeout: 5000 });
      console.log(`[ChromaDB] Version check successful - ChromaDB v${response.data}`);
      
      this.isInitialized = true;
      console.log(`[ChromaDB] Successfully connected to ChromaDB at ${this.baseURL}`);

      return true;
    } catch (error) {
      console.error('[ChromaDB] Failed to connect to ChromaDB server:', error.message);
      this.isInitialized = false;
      return false;
    }
  }

  // HTTP-based collection management methods
  async getCollection(name) {
    try {
      const response = await axios.get(`${this.baseURL}/api/v2/collections/${name}`);
      return { name, ...response.data };
    } catch (error) {
      throw new Error(`Collection ${name} not found`);
    }
  }

  async createCollection(options) {
    try {
      const response = await axios.post(`${this.baseURL}/api/v2/collections`, {
        name: options.name,
        metadata: options.metadata || {}
      });
      return { name: options.name, ...response.data };
    } catch (error) {
      throw new Error(`Failed to create collection ${options.name}: ${error.message}`);
    }
  }

  async addDocuments(collectionName, documents, metadatas, ids) {
    try {
      const embeddings = await Promise.all(documents.map(doc => this.generateLocalEmbedding(doc)));
      
      await axios.post(`${this.baseURL}/api/v2/collections/${collectionName}/add`, {
        documents,
        metadatas,
        ids,
        embeddings
      });
      return true;
    } catch (error) {
      throw new Error(`Failed to add documents to ${collectionName}: ${error.message}`);
    }
  }

  async queryCollection(collectionName, queryTexts, nResults = 8) {
    try {
      const queryEmbeddings = await Promise.all(queryTexts.map(text => this.generateLocalEmbedding(text)));
      
      const response = await axios.post(`${this.baseURL}/api/v2/collections/${collectionName}/query`, {
        query_embeddings: queryEmbeddings,
        n_results: nResults
      });
      
      return response.data;
    } catch (error) {
      throw new Error(`Failed to query collection ${collectionName}: ${error.message}`);
    }
  }

  async getDocuments(collectionName, options = {}) {
    try {
      const response = await axios.post(`${this.baseURL}/api/v2/collections/${collectionName}/get`, options);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to get documents from ${collectionName}: ${error.message}`);
    }
  }

  async countDocuments(collectionName) {
    try {
      const response = await axios.get(`${this.baseURL}/api/v2/collections/${collectionName}/count`);
      return response.data;
    } catch (error) {
      throw new Error(`Failed to count documents in ${collectionName}: ${error.message}`);
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
          console.log(`[ChromaDB] 🔍 DEBUG: Creating profile doc with metadata:`, JSON.stringify(profileDoc.metadata, null, 2));
          documents.push(profileDoc.content);
          metadatas.push(profileDoc.metadata);
          ids.push(`${username}_${platform}_profile`);
        }
      }

      // Process posts/content with enhanced detail for LinkedIn
      if (normalizedData.posts && normalizedData.posts.length > 0) {
        normalizedData.posts.forEach((post, index) => {
          const postDoc = this.createPostDocument(post, platform, username, index);
          if (postDoc) {
            documents.push(postDoc.content);
            metadatas.push(postDoc.metadata);
            ids.push(`${username}_${platform}_post_${index}`);
          }

          // For LinkedIn, create additional detailed post metric documents
          if (platform === 'linkedin' && post.engagement) {
            const metricDoc = this.createPostMetricsDocument(post, platform, username, index);
            if (metricDoc) {
              documents.push(metricDoc.content);
              metadatas.push(metricDoc.metadata);
              ids.push(`${username}_${platform}_post_${index}_metrics`);
            }
          }

          // Create post ranking document for engagement analysis
          if (platform === 'linkedin') {
            const rankingDoc = this.createPostRankingDocument(post, index, normalizedData.posts, platform, username);
            if (rankingDoc) {
              documents.push(rankingDoc.content);
              metadatas.push(rankingDoc.metadata);
              ids.push(`${username}_${platform}_post_${index}_ranking`);
            }
          }
        });
      } else if (platform === 'linkedin') {
        // Create a specific document to acknowledge no posts for LinkedIn
        const noPostsDoc = {
          content: this.sanitizeForChromaDB(`Content Activity Status:
No posts currently available on this LinkedIn profile.
Post Count: 0 posts
Content Status: This profile does not have any public posts or content shared.
Profile Type: Professional LinkedIn profile without posted content.
Engagement Data: No engagement metrics available due to absence of posts.

Note: This is a professional LinkedIn profile that focuses on networking and professional presence rather than content creation. The profile contains comprehensive professional information, education, skills, and experience details, but does not include posted content or engagement metrics.`),
          metadata: {
            type: 'content_activity',
            platform,
            username,
            postCount: 0,
            hasContent: false
          }
        };
        documents.push(noPostsDoc.content);
        metadatas.push(noPostsDoc.metadata);
        ids.push(`${username}_${platform}_content_status`);
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

        // Process LinkedIn-specific data
      if (platform === 'linkedin') {
        // Process experiences
        if (normalizedData.experiences && normalizedData.experiences.length > 0) {
          normalizedData.experiences.forEach((experience, index) => {
            const expDoc = this.createExperienceDocument(experience, platform, username, index);
            if (expDoc) {
              documents.push(expDoc.content);
              metadatas.push(expDoc.metadata);
              ids.push(`${username}_${platform}_experience_${index}`);
            }
          });
        }

        // Process education
        if (normalizedData.education && normalizedData.education.length > 0) {
          console.log(`[ChromaDB] 🔍 DEBUG: Processing ${normalizedData.education.length} education items for ${username}`);
          normalizedData.education.forEach((education, index) => {
            console.log(`[ChromaDB] 🔍 DEBUG: Education ${index}:`, JSON.stringify(education, null, 2));
            const eduDoc = this.createEducationDocument(education, platform, username, index);
            if (eduDoc) {
              console.log(`[ChromaDB] 🔍 DEBUG: Created education doc with content preview:`, eduDoc.content.substring(0, 200));
              documents.push(eduDoc.content);
              metadatas.push(eduDoc.metadata);
              ids.push(`${username}_${platform}_education_${index}`);
            }
          });
        } else {
          console.log(`[ChromaDB] 🔍 DEBUG: No education data found for ${username}`);
        }

        // Process skills
        if (normalizedData.skills && normalizedData.skills.length > 0) {
          normalizedData.skills.forEach((skill, index) => {
            const skillDoc = this.createSkillDocument(skill, platform, username, index);
            if (skillDoc) {
              documents.push(skillDoc.content);
              metadatas.push(skillDoc.metadata);
              ids.push(`${username}_${platform}_skill_${index}`);
            }
          });
        }

        // Process certifications
        if (normalizedData.certifications && normalizedData.certifications.length > 0) {
          normalizedData.certifications.forEach((cert, index) => {
            const certDoc = this.createCertificationDocument(cert, platform, username, index);
            if (certDoc) {
              documents.push(certDoc.content);
              metadatas.push(certDoc.metadata);
              ids.push(`${username}_${platform}_certification_${index}`);
            }
          });
        }

        // Process publications
        if (normalizedData.publications && normalizedData.publications.length > 0) {
          normalizedData.publications.forEach((pub, index) => {
            const pubDoc = this.createPublicationDocument(pub, platform, username, index);
            if (pubDoc) {
              documents.push(pubDoc.content);
              metadatas.push(pubDoc.metadata);
              ids.push(`${username}_${platform}_publication_${index}`);
            }
          });
        }

        // Process languages
        if (normalizedData.languages && normalizedData.languages.length > 0) {
          const langDoc = this.createLanguagesDocument(normalizedData.languages, platform, username);
          if (langDoc) {
            documents.push(langDoc.content);
            metadatas.push(langDoc.metadata);
            ids.push(`${username}_${platform}_languages`);
          }
        }

        // Process interests and following
        if (normalizedData.interests && normalizedData.interests.length > 0) {
          const interestDoc = this.createInterestsDocument(normalizedData.interests, platform, username);
          if (interestDoc) {
            documents.push(interestDoc.content);
            metadatas.push(interestDoc.metadata);
            ids.push(`${username}_${platform}_interests`);
          }
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
        // LinkedIn format (profileInfo + posts + experiences + skills + education)
        if (data.profileInfo && platform === 'linkedin') {
          const profileObj = data.profileInfo;
          // Normalize LinkedIn profile fields
          normalized.profile = {
            ...profileObj,
            username: profileObj.publicIdentifier || profileObj.username || '',
            fullName: profileObj.fullName || profileObj.firstName + ' ' + profileObj.lastName || '',
            followersCount: profileObj.followers || profileObj.connections || 0,
            biography: profileObj.about || profileObj.headline || '',
            jobTitle: profileObj.jobTitle || '',
            companyName: profileObj.companyName || '',
            location: profileObj.addressWithCountry || profileObj.addressWithoutCountry || '',
            industry: profileObj.companyIndustry || '',
            skills: profileObj.topSkillsByEndorsements || ''
          };

          // Process LinkedIn posts with correct engagement mapping and debug logging
          normalized.posts = (data.posts || []).map((post, index) => {
            const engagementData = {
              likes: post.engagement?.likes || 0,
              comments: post.engagement?.comments || 0,
              shares: post.engagement?.shares || 0
            };
            
            // Debug log for first few posts to verify engagement mapping
            if (index < 3) {
              console.log(`[ChromaDB] 🔍 DEBUG: LinkedIn Post ${index + 1} engagement mapping:`, {
                sourceEngagement: post.engagement,
                normalizedEngagement: engagementData,
                content: (post.content || '').substring(0, 50) + '...'
              });
            }
            
            return {
              content: post.content || post.text || '',
              timestamp: post.postedAt?.timestamp || post.timestamp,
              engagement: engagementData,
              hashtags: this.extractHashtags(post.content || post.text || ''),
              mentions: this.extractMentions(post.content || post.text || ''),
              type: post.type || 'post'
            };
          });

          // Fallback: Some LinkedIn datasets expose posts under `updates` instead of `posts`
          // Map `updates` to normalized posts if no posts were found
          if ((!normalized.posts || normalized.posts.length === 0) && Array.isArray(data.updates) && data.updates.length > 0) {
            normalized.posts = data.updates.map(update => ({
              content: update.postText || update.text || '',
              timestamp: update.timestamp || null,
              engagement: {
                likes: update.numLikes || 0,
                comments: update.numComments || 0,
                // LinkedIn updates often don't expose share counts in this structure
                shares: 0
              },
              hashtags: this.extractHashtags(update.postText || update.text || ''),
              mentions: this.extractMentions(update.postText || update.text || ''),
              type: 'post'
            })).filter(p => p.content && p.content.trim().length > 0);
          }

          // Add LinkedIn-specific data for indexing - use profileInfo nested structure
          normalized.experiences = data.profileInfo.experiences || [];
          normalized.education = data.profileInfo.educations || []; // LinkedIn uses educations plural
          normalized.skills = data.profileInfo.skills || [];
          normalized.certifications = data.profileInfo.licenseAndCertificates || [];
          normalized.publications = data.profileInfo.publications || [];
          normalized.languages = data.profileInfo.languages || [];
          normalized.interests = data.profileInfo.interests || [];
        } 
        // Facebook Page format (profileInfo + posts)
        else if (data.profileInfo && Array.isArray(data.posts)) {
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
      // LinkedIn-specific profile document with comprehensive data
      if (platform === 'linkedin') {
        const content = `LinkedIn Professional Profile: ${profile.fullName || profile.firstName + ' ' + profile.lastName || username}
Username: @${profile.publicIdentifier || username}
Platform: LinkedIn Professional Network

Personal Information:
Name: ${profile.fullName || profile.firstName + ' ' + profile.lastName || 'Name not available'}
Professional Headline: ${profile.headline || 'Headline not available'}
Connections: ${profile.connections === null ? 'connections data not available' : profile.connections + ' connections'}
Followers: ${(profile.followers || 0).toLocaleString()} followers
About Section: ${profile.about || profile.biography || 'No about section available'}
LinkedIn URL: ${profile.linkedinUrl || 'Not available'}
Location: ${profile.addressWithCountry || 'Location not specified'}
Industry: ${profile.companyIndustry || 'Industry not specified'}
Top Skills: ${profile.topSkillsByEndorsements || 'Skills not available'}

Current Professional Role:
Position: ${profile.jobTitle || 'Position not specified'}
Company: ${profile.companyName || 'Company not specified'}
Company Website: ${profile.companyWebsite || 'Not available'}
Company LinkedIn: ${profile.companyLinkedin || 'Not available'}
Company Founded: ${profile.companyFoundedIn || 'Not available'}
Company Size: ${profile.companySize || 'Not available'}
Current Role Duration: ${profile.currentJobDuration || 'Not specified'}
Duration in Years: ${profile.currentJobDurationInYrs || 'Not specified'}

Profile Images:
Profile Picture: ${profile.profilePic || 'Not available'}
High Quality Profile Picture: ${profile.profilePicHighQuality || 'Not available'}

Professional Network:
Connections: ${profile.connections || 'Not available'} connections
Followers: ${profile.followers || 'Not available'} followers
Open to Connect: ${profile.openConnection || 'Not specified'}
URN: ${profile.urn || 'Not available'}`;

        return {
          content: this.sanitizeForChromaDB(content),
          metadata: {
            type: 'profile',
            platform,
            username,
            followerCount: profile.followers || 0,
            connectionCount: profile.connections || 0,
            verified: false,
            businessAccount: false,
            category: 'professional',
            jobTitle: profile.jobTitle || '',
            company: profile.companyName || '',
            location: profile.location || profile.addressWithCountry || ''
          }
        };
      }

      // Original logic for other platforms
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
        content: this.sanitizeForChromaDB(content),
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
        console.log(`[ChromaDB] 🔍 DEBUG: Skipping post ${index + 1} - empty content:`, {
          hasContent: !!post.content,
          contentLength: post.content ? post.content.length : 0,
          contentPreview: post.content ? post.content.substring(0, 50) + '...' : 'NO CONTENT'
        });
        return null; // Skip empty posts
      }

      // Ensure hashtags and mentions are arrays to prevent join() errors
      const hashtags = Array.isArray(post.hashtags) ? post.hashtags : [];
      const mentions = Array.isArray(post.mentions) ? post.mentions : [];
      
      // Debug log for LinkedIn posts to track content mapping
      if (platform === 'linkedin' && index < 3) {
        console.log(`[ChromaDB] 🔍 DEBUG: Creating LinkedIn Post ${index + 1} document:`, {
          contentLength: post.content.length,
          contentPreview: post.content.substring(0, 100) + '...',
          hashtagsCount: hashtags.length,
          mentionsCount: mentions.length,
          engagement: post.engagement
        });
      }

      const content = `Post ${index + 1} on ${platform}:
Content: ${post.content}
Hashtags: ${hashtags.join(' ')}
Mentions: ${mentions.join(' ')}
Likes: ${(post.engagement?.likes || 0).toLocaleString()}
Comments: ${(post.engagement?.comments || 0).toLocaleString()}
Retweets: ${(post.engagement?.shares || 0).toLocaleString()}
Total Engagement: ${((post.engagement?.likes || 0) + (post.engagement?.comments || 0) + (post.engagement?.shares || 0)).toLocaleString()}
Posted: ${post.timestamp || 'Recent'}`;

      return {
        content: this.sanitizeForChromaDB(content),
        metadata: {
          type: 'post',
          platform,
          username,
          postIndex: index,
          likes: post.engagement?.likes || 0,
          comments: post.engagement?.comments || 0,
          shares: post.engagement?.shares || 0,
          totalEngagement: (post.engagement?.likes || 0) + (post.engagement?.comments || 0) + (post.engagement?.shares || 0),
          hashtagCount: hashtags.length,
          mentionCount: mentions.length,
          wordCount: post.content.split(/\s+/).length
        }
      };
    } catch (error) {
      console.error(`[ChromaDB] Error creating post document for ${platform}/${username} post ${index + 1}:`, error);
      console.error('[ChromaDB] Post data causing error:', JSON.stringify(post, null, 2));
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

  // LinkedIn-specific document creation functions
  createExperienceDocument(experience, platform, username, index) {
    try {
      if (!experience.title && !experience.subtitle) {
        return null; // Skip empty experiences
      }

      // Extract detailed date information for timeline queries
      const caption = experience.caption || '';
      const dateMatch = caption.match(/(\w{3}\s\d{4})\s*-\s*(\w{3}\s\d{4}|\w+)/);
      let startDate = '', endDate = '', years = [];
      
      if (dateMatch) {
        startDate = dateMatch[1];
        endDate = dateMatch[2];
        
        // Extract years for searchability
        const startYear = parseInt(startDate.split(' ')[1]);
        const endYear = endDate.includes('Present') ? new Date().getFullYear() : parseInt(endDate.split(' ')[1]);
        
        if (startYear && endYear) {
          for (let year = startYear; year <= endYear; year++) {
            years.push(year);
          }
        }
      }

      const companyName = experience.subtitle ? experience.subtitle.split(' · ')[0] : '';
      const jobType = experience.subtitle ? experience.subtitle.split(' · ')[1] || '' : '';

      const content = `EXPERIENCE RECORD:
Position: ${experience.title || 'Position'}
Company: ${companyName}
Employment Type: ${jobType}
Duration: ${caption}
Start Date: ${startDate}
End Date: ${endDate}
Years Active: ${years.join(', ')}
Location: ${experience.metadata || 'Location'}
Description: ${experience.subComponents?.[0]?.description?.join(' ') || 'No description'}
Skills: ${experience.skills || 'Not specified'}
Industry: ${experience.industry || 'Not specified'}

TIMELINE SEARCHABILITY:
Job in ${years.map(y => `${y}: ${experience.title} at ${companyName}`).join(' | ')}
Career timeline: ${startDate} to ${endDate} as ${experience.title}`;

      return {
        content: this.sanitizeForChromaDB(content),
        metadata: {
          type: 'experience',
          platform,
          username,
          title: experience.title || '',
          company: companyName,
          jobType: jobType,
          duration: caption,
          startDate: startDate,
          endDate: endDate,
          years: years,
          location: experience.metadata || '',
          index
        }
      };
    } catch (error) {
      console.error('[ChromaDB] Error creating experience document:', error);
      return null;
    }
  }

  createEducationDocument(education, platform, username, index) {
    try {
      // Handle LinkedIn education structure
      if (platform === 'linkedin') {
        if (!education.title && !education.subtitle) {
          return null; // Skip empty education
        }

        // Extract degree details from LinkedIn structure
        const institution = education.title || 'Institution';
        const degreeInfo = education.subtitle || 'Degree';
        const duration = education.caption || 'Duration not specified';
        const grade = education.subComponents?.[0]?.description?.[0]?.text || 'Grade not specified';
        
        // Parse PhD/degree information for better searchability
        let degreeType = '';
        let field = '';
        if (degreeInfo.includes('PhD') || degreeInfo.includes('Doctor of Philosophy')) {
          degreeType = 'PhD (Doctor of Philosophy)';
          if (degreeInfo.includes(',')) {
            field = degreeInfo.split(',')[1].trim();
          }
        } else if (degreeInfo.includes('Master') || degreeInfo.includes('MPhil')) {
          degreeType = 'Master\'s Degree';
          if (degreeInfo.includes(',')) {
            field = degreeInfo.split(',')[1].trim();
          }
        } else {
          degreeType = degreeInfo;
        }

        const content = `Education Background:
Degree: ${degreeType}
Field of Study: ${field || degreeInfo}
Institution: ${institution}
Duration: ${duration}
Grade/Performance: ${grade}
Full Degree Description: ${degreeInfo}
Location: ${education.metadata || 'Location not specified'}

Key Details:
- Completed ${degreeType} at ${institution}
- Specialized in ${field || 'the specified field'}
- Academic performance: ${grade}
- Study period: ${duration}`;

        return {
          content: this.sanitizeForChromaDB(content),
          metadata: {
            type: 'education',
            platform,
            username,
            degree: degreeType,
            school: institution,
            field: field || degreeInfo,
            fullDescription: degreeInfo,
            duration: duration,
            grade: grade,
            index
          }
        };
      }

      // Handle other platforms (original logic)
      if (!education.schoolName && !education.degreeName) {
        return null; // Skip empty education
      }

      const content = `Education: ${education.degreeName || education.fieldOfStudy || 'Degree'}
Institution: ${education.schoolName || 'School'}
Duration: ${education.timePeriod?.startDate?.year || ''} - ${education.timePeriod?.endDate?.year || 'Present'}
Field: ${education.fieldOfStudy || 'Field of Study'}
Description: ${education.description || 'No description'}
Grade: ${education.grade || 'Not specified'}`;

      return {
        content: this.sanitizeForChromaDB(content),
        metadata: {
          type: 'education',
          platform,
          username,
          degree: education.degreeName || '',
          school: education.schoolName || '',
          field: education.fieldOfStudy || '',
          startYear: education.timePeriod?.startDate?.year || null,
          endYear: education.timePeriod?.endDate?.year || null,
          index
        }
      };
    } catch (error) {
      console.error('[ChromaDB] Error creating education document:', error);
      return null;
    }
  }

  createSkillDocument(skill, platform, username, index) {
    try {
      if (!skill.name && !skill.title) {
        return null; // Skip empty skills
      }

      const skillName = skill.name || skill.title || skill;
      const endorsements = skill.endorsements || skill.endorsementCount || 0;
      
      const content = `Skill: ${skillName}
Endorsements: ${endorsements}
Category: ${skill.category || 'Professional Skill'}
Level: ${skill.level || 'Proficient'}
Years of Experience: ${skill.yearsOfExperience || 'Not specified'}
Related Skills: ${skill.relatedSkills?.join(', ') || 'None listed'}`;

      return {
        content,
        metadata: {
          type: 'skill',
          platform,
          username,
          skillName: skillName,
          endorsements: parseInt(endorsements) || 0,
          category: skill.category || '',
          level: skill.level || '',
          index
        }
      };
    } catch (error) {
      console.error('[ChromaDB] Error creating skill document:', error);
      return null;
    }
  }

  createCertificationDocument(certification, platform, username, index) {
    try {
      if (!certification.name && !certification.title) {
        return null; // Skip empty certifications
      }

      const content = `Certification: ${certification.name || certification.title}
Issuing Organization: ${certification.authority || certification.organization || 'Organization'}
Issue Date: ${certification.timePeriod?.startDate?.month || ''}/${certification.timePeriod?.startDate?.year || ''}
Expiry Date: ${certification.timePeriod?.endDate?.month || ''}/${certification.timePeriod?.endDate?.year || 'No expiry'}
Credential ID: ${certification.credentialId || 'Not provided'}
Skills: ${certification.skills?.join(', ') || 'Not specified'}
Description: ${certification.description || 'No description'}`;

      return {
        content,
        metadata: {
          type: 'certification',
          platform,
          username,
          name: certification.name || certification.title || '',
          organization: certification.authority || certification.organization || '',
          issueYear: certification.timePeriod?.startDate?.year || null,
          expiryYear: certification.timePeriod?.endDate?.year || null,
          credentialId: certification.credentialId || '',
          index
        }
      };
    } catch (error) {
      console.error('[ChromaDB] Error creating certification document:', error);
      return null;
    }
  }

  createPublicationDocument(publication, platform, username, index) {
    try {
      if (!publication.name && !publication.title) {
        return null; // Skip empty publications
      }

      const content = `Publication: ${publication.name || publication.title}
Authors: ${publication.authors?.join(', ') || 'Authors not listed'}
Publication Date: ${publication.date?.month || ''}/${publication.date?.year || ''}
Publisher: ${publication.publisher || 'Publisher not specified'}
Description: ${publication.description || 'No description'}
URL: ${publication.url || 'No URL provided'}
Type: ${publication.type || 'Publication'}`;

      return {
        content,
        metadata: {
          type: 'publication',
          platform,
          username,
          title: publication.name || publication.title || '',
          authors: publication.authors || [],
          year: publication.date?.year || null,
          publisher: publication.publisher || '',
          type: publication.type || 'publication',
          index
        }
      };
    } catch (error) {
      console.error('[ChromaDB] Error creating publication document:', error);
      return null;
    }
  }

  // LinkedIn Post Metrics Document for detailed engagement analysis
  createPostMetricsDocument(post, platform, username, index) {
    try {
      if (!post.engagement) {
        return null;
      }

      const engagement = post.engagement;
      const totalEngagement = (engagement.likes || 0) + (engagement.comments || 0) + (engagement.shares || 0);
      const postDate = new Date(post.timestamp || Date.now());
      
      const content = `POST METRICS ANALYSIS:
Post #${index + 1} Detailed Metrics
Content Preview: "${(post.content || '').substring(0, 100)}..."
Likes: ${engagement.likes || 0}
Comments: ${engagement.comments || 0}
Shares/Reposts: ${engagement.shares || 0}
Total Engagement: ${totalEngagement}
Post Date: ${postDate.toDateString()}
Post Type: ${post.type || 'standard'}

ENGAGEMENT BREAKDOWN:
Reactions received: ${engagement.likes || 0} likes
Discussion generated: ${engagement.comments || 0} comments  
Reach amplification: ${engagement.shares || 0} shares
Overall performance: ${totalEngagement > 50 ? 'High' : totalEngagement > 10 ? 'Medium' : 'Low'} engagement

SEARCHABLE METRICS:
Post ${index + 1} metrics: ${engagement.likes || 0} likes, ${engagement.comments || 0} comments, ${engagement.shares || 0} shares
Exact engagement numbers for post ${index + 1}: likes=${engagement.likes || 0}, comments=${engagement.comments || 0}, shares=${engagement.shares || 0}`;

      return {
        content,
        metadata: {
          type: 'post_metrics',
          platform,
          username,
          postIndex: index,
          likes: engagement.likes || 0,
          comments: engagement.comments || 0,
          shares: engagement.shares || 0,
          totalEngagement: totalEngagement,
          postDate: postDate.toISOString(),
          performance: totalEngagement > 50 ? 'High' : totalEngagement > 10 ? 'Medium' : 'Low'
        }
      };
    } catch (error) {
      console.error('[ChromaDB] Error creating post metrics document:', error);
      return null;
    }
  }

  // LinkedIn Post Ranking Document for comparative analysis
  createPostRankingDocument(post, index, allPosts, platform, username) {
    try {
      if (!allPosts || allPosts.length === 0) {
        return null;
      }

      // Calculate engagement rankings
      const postsWithEngagement = allPosts.map((p, i) => ({
        index: i,
        totalEngagement: (p.engagement?.likes || 0) + (p.engagement?.comments || 0) + (p.engagement?.shares || 0),
        likes: p.engagement?.likes || 0,
        comments: p.engagement?.comments || 0,
        shares: p.engagement?.shares || 0,
        content: p.content || ''
      }));

      // Sort by total engagement
      const sortedPosts = [...postsWithEngagement].sort((a, b) => b.totalEngagement - a.totalEngagement);
      const currentPostRank = sortedPosts.findIndex(p => p.index === index) + 1;
      
      // Sort by likes only
      const likesSorted = [...postsWithEngagement].sort((a, b) => b.likes - a.likes);
      const likesRank = likesSorted.findIndex(p => p.index === index) + 1;

      // Find most and least engaging posts
      const mostEngaging = sortedPosts[0];
      const leastEngaging = sortedPosts[sortedPosts.length - 1];
      const isHighest = currentPostRank === 1;
      const isLowest = currentPostRank === sortedPosts.length;

      const content = `POST RANKING ANALYSIS:
Post #${index + 1} Performance Ranking
Overall Engagement Rank: ${currentPostRank} of ${allPosts.length} posts
Likes Rank: ${likesRank} of ${allPosts.length} posts
Performance Category: ${isHighest ? 'HIGHEST ENGAGING' : isLowest ? 'LOWEST ENGAGING' : 'MEDIUM PERFORMING'}

COMPARATIVE ANALYSIS:
${isHighest ? 'This is your MOST engaging post' : `This post ranks #${currentPostRank} in engagement`}
${isLowest ? 'This is your LEAST engaging post' : ''}
Most engaging post has ${mostEngaging.totalEngagement} total engagement
Least engaging post has ${leastEngaging.totalEngagement} total engagement
This post has ${postsWithEngagement[index].totalEngagement} total engagement

SEARCHABLE RANKINGS:
${isHighest ? 'Highest engaging post, most engaging post, best performing post' : ''}
${isLowest ? 'Lowest engaging post, least engaging post, worst performing post' : ''}
${currentPostRank === 2 ? 'Second most engaging post, second highest post' : ''}
${currentPostRank === 3 ? 'Third most engaging post, third highest post' : ''}
Post ranking: ${currentPostRank} out of ${allPosts.length}`;

      return {
        content,
        metadata: {
          type: 'post_ranking',
          platform,
          username,
          postIndex: index,
          overallRank: currentPostRank,
          likesRank: likesRank,
          totalPosts: allPosts.length,
          isHighest: isHighest,
          isLowest: isLowest,
          engagementScore: postsWithEngagement[index].totalEngagement
        }
      };
    } catch (error) {
      console.error('[ChromaDB] Error creating post ranking document:', error);
      return null;
    }
  }

  // LinkedIn Experience Document Creator
  createExperienceDocument(experience, platform, username, index) {
    try {
      const content = `Professional Experience ${index + 1}:
Company: ${experience.subtitle || experience.companyName || 'Not specified'}
Position: ${experience.title || 'Not specified'}
Duration: ${experience.caption || 'Not specified'}
Location: ${experience.metadata || 'Not specified'}
Company ID: ${experience.companyId || 'Not specified'}
Experience Type: ${experience.breakdown ? 'Multiple Roles' : 'Single Role'}
${experience.subComponents && experience.subComponents.length > 0 ? 
  'Role Details:\n' + experience.subComponents.map(sub => 
    `- ${sub.title || ''} ${sub.caption || ''}`
  ).join('\n') : ''}`;

      return {
        content: this.sanitizeForChromaDB(content),
        metadata: {
          type: 'experience',
          platform,
          username,
          experienceIndex: index,
          companyName: experience.subtitle || experience.companyName || '',
          position: experience.title || '',
          duration: experience.caption || '',
          hasMultipleRoles: experience.breakdown || false
        }
      };
    } catch (error) {
      console.error('[ChromaDB] Error creating experience document:', error);
      return null;
    }
  }

  // LinkedIn Education Document Creator
  createEducationDocument(education, platform, username, index) {
    try {
      const content = `Education ${index + 1}:
Institution: ${education.title || 'Not specified'}
Degree: ${education.subtitle || 'Not specified'}
Duration: ${education.caption || 'Not specified'}
Institution ID: ${education.companyId || 'Not specified'}
Education Type: ${education.breakdown ? 'Multiple Programs' : 'Single Program'}`;

      return {
        content: this.sanitizeForChromaDB(content),
        metadata: {
          type: 'education',
          platform,
          username,
          educationIndex: index,
          institution: education.title || '',
          degree: education.subtitle || '',
          duration: education.caption || ''
        }
      };
    } catch (error) {
      console.error('[ChromaDB] Error creating education document:', error);
      return null;
    }
  }

  // LinkedIn Skills Document Creator
  createSkillDocument(skill, platform, username, index) {
    try {
      const endorsementCount = skill.subComponents && skill.subComponents[0] && skill.subComponents[0].description ?
        skill.subComponents[0].description.find(desc => desc.text && desc.text.includes('endorsement')) : null;
      
      const endorsements = endorsementCount ? 
        endorsementCount.text.match(/(\d+)\s+endorsement/i)?.[1] || '0' : '0';

      const content = `Professional Skill ${index + 1}:
Skill Name: ${skill.title || 'Not specified'}
Endorsements: ${endorsements}
Skill Category: Professional Competency
Endorsement Details: ${endorsementCount ? endorsementCount.text : 'No endorsement data'}`;

      return {
        content: this.sanitizeForChromaDB(content),
        metadata: {
          type: 'skill',
          platform,
          username,
          skillIndex: index,
          skillName: skill.title || '',
          endorsementCount: parseInt(endorsements) || 0
        }
      };
    } catch (error) {
      console.error('[ChromaDB] Error creating skill document:', error);
      return null;
    }
  }

  // LinkedIn Certification Document Creator
  createCertificationDocument(certification, platform, username, index) {
    try {
      const content = `Certification ${index + 1}:
Title: ${certification.title || 'Not specified'}
Details: ${certification.subtitle || 'Not specified'}
${certification.caption ? `Duration: ${certification.caption}` : ''}`;

      return {
        content: this.sanitizeForChromaDB(content),
        metadata: {
          type: 'certification',
          platform,
          username,
          certificationIndex: index,
          title: certification.title || '',
          details: certification.subtitle || ''
        }
      };
    } catch (error) {
      console.error('[ChromaDB] Error creating certification document:', error);
      return null;
    }
  }

  // LinkedIn Publication Document Creator
  createPublicationDocument(publication, platform, username, index) {
    try {
      const content = `Publication ${index + 1}:
Title: ${publication.title || 'Not specified'}
Details: ${publication.subtitle || 'Not specified'}`;

      return {
        content: this.sanitizeForChromaDB(content),
        metadata: {
          type: 'publication',
          platform,
          username,
          publicationIndex: index,
          title: publication.title || ''
        }
      };
    } catch (error) {
      console.error('[ChromaDB] Error creating publication document:', error);
      return null;
    }
  }

  // LinkedIn Languages Document Creator
  createLanguagesDocument(languages, platform, username) {
    try {
      const languageList = languages.map(lang => lang.title).join(', ');
      const content = `Languages:
Spoken Languages: ${languageList}
Total Languages: ${languages.length}
Language Proficiency: Professional multilingual capability`;

      return {
        content: this.sanitizeForChromaDB(content),
        metadata: {
          type: 'languages',
          platform,
          username,
          languageCount: languages.length,
          languages: languages.map(lang => lang.title)
        }
      };
    } catch (error) {
      console.error('[ChromaDB] Error creating languages document:', error);
      return null;
    }
  }

  // LinkedIn Interests Document Creator
  createInterestsDocument(interests, platform, username) {
    try {
      const interestSections = interests.map(section => {
        const sectionName = section.section_name || 'Professional Interests';
        const components = section.section_components || [];
        const topInfluencers = components.map(comp => 
          `${comp.titleV2} (${comp.caption})`
        ).join(', ');
        
        return `${sectionName}: ${topInfluencers}`;
      }).join('\n');

      const content = `Professional Interests and Following:
${interestSections}
Interest Categories: ${interests.length}
Professional Network: Following industry leaders and influencers`;

      return {
        content: this.sanitizeForChromaDB(content),
        metadata: {
          type: 'interests',
          platform,
          username,
          interestSections: interests.length,
          topInfluencers: interests.flatMap(section => 
            (section.section_components || []).map(comp => comp.titleV2)
          ).filter(Boolean)
        }
      };
    } catch (error) {
      console.error('[ChromaDB] Error creating interests document:', error);
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
        collection = await this.getCollection(collectionName);
        console.log(`[ChromaDB] Using existing collection: ${collectionName}`);
      } catch (error) {
        // Collection doesn't exist, create it
        console.log(`[ChromaDB] Creating new collection: ${collectionName}`);
        try {
          collection = await this.createCollection({
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
        const existingCount = await this.countDocuments(collectionName);
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
      await this.addDocuments(collectionName, documents, cleanMetadatas, validIds);
        console.log(`[ChromaDB] Successfully added ${documents.length} documents for ${platform}/${username}`);
      }

      // Verify the data was stored
      try {
        const finalCount = await this.countDocuments(collectionName);
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
        collection = await this.getCollection(collectionName);
        console.log(`[ChromaDB] Found existing collection: ${collectionName}`);
      } catch (error) {
        // Collection doesn't exist, try to create it
        console.log(`[ChromaDB] Collection ${collectionName} not found, attempting to create...`);
        try {
          collection = await this.createCollection({
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
        const count = await this.countDocuments(collectionName);
        if (count === 0) {
          console.log(`[ChromaDB] Collection ${collectionName} is empty, but continuing with search`);
        }
        console.log(`[ChromaDB] Collection ${collectionName} has ${count} documents`);
      } catch (countError) {
        console.log(`[ChromaDB] Could not check collection count: ${countError.message}`);
      }

      // Generate query embedding
      const queryEmbedding = await this.embeddings.embedQuery(query);

      // Search with user filter
      console.log(`[ChromaDB] 🔍 DEBUG: Searching for username="${username}" in collection ${collectionName}`);
      const results = await this.queryCollection(collectionName, [query], limit);
      console.log(`[ChromaDB] 🔍 DEBUG: Found ${results.documents[0]?.length || 0} documents for username="${username}"`);

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
      
      // For LinkedIn, get more comprehensive documents to ensure complete context
      const searchLimit = platform === 'linkedin' ? 15 : 8;
      const relevantDocs = await this.semanticSearch(query, username, platform, searchLimit);
      
      // For LinkedIn, if we don't have enough diverse document types, fetch additional ones
      if (platform === 'linkedin' && relevantDocs.length < 10) {
        console.log(`[ChromaDB] LinkedIn context enhancement: Found ${relevantDocs.length} docs, fetching additional comprehensive data`);
        try {
          const allUserDocs = await this.semanticSearch('profile education experience skills LinkedIn professional', username, platform, 20);
          console.log(`[ChromaDB] LinkedIn enhancement: Retrieved ${allUserDocs.length} additional documents`);
          
          // Merge with existing docs, avoiding duplicates
          const existingIds = new Set(relevantDocs.map(doc => doc.metadata.id || doc.content.substring(0, 50)));
          allUserDocs.forEach(doc => {
            const docId = doc.metadata.id || doc.content.substring(0, 50);
            if (!existingIds.has(docId)) {
              relevantDocs.push(doc);
              existingIds.add(docId);
            }
          });
          console.log(`[ChromaDB] LinkedIn final context: ${relevantDocs.length} total documents`);
        } catch (enhanceError) {
          console.log(`[ChromaDB] LinkedIn enhancement failed:`, enhanceError.message);
        }
      }

      if (relevantDocs.length === 0) {
        console.log(`[ChromaDB] No relevant documents found for ${platform}/${username}, checking for any available data`);
        
        // Try to get any documents for this user/platform combination
        try {
          const collectionName = `${platform}_profiles`;
          const collection = await this.getCollection(collectionName);
          
          // Get all documents for this user
          const allDocs = await this.getDocuments(collectionName, {
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
        engagement: [],
        education: [],
        experience: [],
        skills: [],
        content_activity: []
      };

      relevantDocs.forEach(doc => {
        const type = doc.metadata.type;
        if (type === 'post') {
          groupedDocs.posts.push(doc);
        } else if (groupedDocs[type]) {
          groupedDocs[type].push(doc);
        } else {
          // Add unknown types to ensure no data is lost
          console.log(`[ChromaDB] Unknown document type: ${type}, adding to general context`);
          if (!groupedDocs.other) groupedDocs.other = [];
          groupedDocs.other.push(doc);
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

      // Education context - crucial for LinkedIn
      if (groupedDocs.education.length > 0) {
        context += "Educational Background:\n";
        groupedDocs.education.forEach(doc => {
          context += `${doc.content}\n`;
        });
        context += "\n";
      }

      // Experience context - crucial for LinkedIn
      if (groupedDocs.experience.length > 0) {
        context += "Professional Experience:\n";
        groupedDocs.experience.forEach(doc => {
          context += `${doc.content}\n`;
        });
        context += "\n";
      }

      // Skills context - important for LinkedIn
      if (groupedDocs.skills.length > 0) {
        context += "Skills and Expertise:\n";
        groupedDocs.skills.forEach(doc => {
          context += `${doc.content}\n`;
        });
        context += "\n";
      }

      // Content activity context - important for post queries
      if (groupedDocs.content_activity.length > 0) {
        context += "Content Activity Information:\n";
        groupedDocs.content_activity.forEach(doc => {
          context += `${doc.content}\n`;
        });
        context += "\n";
      }

      // Other unknown document types
      if (groupedDocs.other && groupedDocs.other.length > 0) {
        context += "Additional Information:\n";
        groupedDocs.other.forEach(doc => {
          context += `${doc.content}\n`;
        });
        context += "\n";
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
        collection = await this.getCollection(collectionName);
        const count = await this.countDocuments(collectionName);
        
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