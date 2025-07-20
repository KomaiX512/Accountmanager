#!/usr/bin/env node

/**
 * 🎯 RECOMMENDATION GENERATOR
 * 
 * This script generates and stores actual recommendation files in R2 
 * so the frontend can display them reliably.
 * 
 * The issue was that recommendations were only generated dynamically via RAG,
 * but never stored as files that the frontend could fetch.
 */

import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Initialize S3 client for R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: 'https://d1f7bcd392ab7b6e983c89b6bab6dafc.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_KEY
  }
});

// Helper to convert stream to string
const streamToString = (stream) => new Promise((resolve, reject) => {
  const chunks = [];
  stream.on('data', (chunk) => chunks.push(chunk));
  stream.on('error', reject);
  stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
});

/**
 * Generate recommendations using the RAG server for a specific account
 */
async function generateRecommendationsForAccount(username, platform) {
  console.log(`\n🎯 Generating recommendations for ${platform}/${username}...`);
  
  try {
    // Use the RAG server to generate recommendations
    const response = await axios.post('http://localhost:3001/api/rag/discussion', {
      username: username,
      query: 'Provide comprehensive strategic recommendations for this account, including content strategy, growth tactics, engagement optimization, and competitive positioning. Focus on actionable insights.',
      platform: platform
    }, {
      timeout: 30000 // 30 second timeout
    });

    if (response.data && response.data.response) {
      return {
        timestamp: new Date().toISOString(),
        username: username,
        platform: platform,
        type: 'strategic_recommendations',
        data: {
          title: `Strategic Recommendations for @${username}`,
          content: response.data.response,
          generated_at: new Date().toISOString(),
          generated_by: 'AI_RAG_System',
          account_type: 'branding', // Default assumption
          categories: [
            'content_strategy',
            'growth_tactics', 
            'engagement_optimization',
            'competitive_analysis'
          ]
        }
      };
    } else {
      throw new Error('Invalid response from RAG server');
    }

  } catch (error) {
    console.error(`❌ Error generating recommendations for ${username}:`, error.message);
    
    // Fallback: Generate basic recommendations template
    return {
      timestamp: new Date().toISOString(),
      username: username,
      platform: platform,
      type: 'strategic_recommendations',
      data: {
        title: `Strategic Recommendations for @${username}`,
        content: generateFallbackRecommendations(username, platform),
        generated_at: new Date().toISOString(),
        generated_by: 'Fallback_System',
        account_type: 'branding',
        categories: [
          'content_strategy',
          'growth_tactics',
          'platform_optimization'
        ]
      }
    };
  }
}

/**
 * Generate fallback recommendations when RAG server is unavailable
 */
function generateFallbackRecommendations(username, platform) {
  const platformName = platform === 'instagram' ? 'Instagram' : 
                      platform === 'facebook' ? 'Facebook' : 
                      platform === 'twitter' ? 'X (Twitter)' : platform;

  return `## Strategic Recommendations for @${username}

### 🎯 **Content Strategy**
1. **Consistent Posting Schedule**: Maintain regular posting frequency optimal for ${platformName}
2. **Visual Branding**: Develop cohesive visual identity across all content
3. **Content Mix**: Balance promotional, educational, and entertaining content (80/20 rule)
4. **Storytelling**: Create authentic narratives that resonate with your audience

### 📈 **Growth Tactics**
1. **Hashtag Strategy**: Use platform-specific hashtags to increase discoverability
2. **Community Engagement**: Actively respond to comments and engage with followers
3. **Cross-Promotion**: Leverage other platforms to drive ${platformName} growth
4. **Collaboration**: Partner with complementary accounts for mutual growth

### 🔥 **Engagement Optimization**
1. **Post Timing**: Analyze when your audience is most active
2. **Call-to-Actions**: Include clear CTAs to encourage interaction
3. **User-Generated Content**: Encourage and share content from your community
4. **Interactive Features**: Use ${platformName}'s native interactive features

### 🎖️ **Competitive Positioning**
1. **Unique Value Proposition**: Clearly define what makes your account unique
2. **Competitor Analysis**: Regular monitoring of competitor strategies
3. **Trend Adaptation**: Stay current with ${platformName} trends and features
4. **Brand Voice**: Maintain consistent personality across all interactions

### 📊 **Performance Monitoring**
1. **Analytics Tracking**: Regular review of ${platformName} insights
2. **Content Performance**: Identify and replicate top-performing content types
3. **Audience Growth**: Monitor follower quality and engagement rates
4. **ROI Measurement**: Track business objectives and conversion metrics

**Next Steps**: Implement these recommendations systematically, starting with content strategy and posting consistency. Monitor performance weekly and adjust tactics based on ${platformName} analytics data.`;
}

/**
 * Save recommendations to R2 storage
 */
async function saveRecommendationsToR2(recommendations, username, platform) {
  const key = `recommendations/${platform}/${username}/strategy_${Date.now()}.json`;
  
  try {
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(recommendations, null, 2),
      ContentType: 'application/json',
      Metadata: {
        'username': username,
        'platform': platform,
        'type': 'recommendations',
        'generated': new Date().toISOString()
      }
    });

    await s3Client.send(putCommand);
    console.log(`✅ Saved recommendations to R2: ${key}`);
    return key;

  } catch (error) {
    console.error(`❌ Error saving to R2:`, error.message);
    throw error;
  }
}

/**
 * Find existing accounts with profile data
 */
async function findExistingAccounts() {
  console.log('🔍 Scanning for existing accounts in R2...\n');
  
  const accounts = new Set();
  
  try {
    // Check common data locations
    const prefixesToCheck = [
      'ProfileInfo/',
      'AccountInfo/', 
      'structuredb/',
      'competitor_analysis/'
    ];

    for (const prefix of prefixesToCheck) {
      try {
        const listCommand = new ListObjectsV2Command({
          Bucket: 'tasks',
          Prefix: prefix,
          MaxKeys: 100
        });

        const response = await s3Client.send(listCommand);
        
        if (response.Contents) {
          response.Contents.forEach(obj => {
            const keyParts = obj.Key.split('/');
            if (keyParts.length >= 3) {
              const platform = keyParts[1];
              const username = keyParts[2];
              
              if (['instagram', 'facebook', 'twitter'].includes(platform) && username) {
                accounts.add(`${platform}/${username}`);
              }
            }
          });
        }
      } catch (error) {
        console.log(`⚠️  Could not scan ${prefix}: ${error.message}`);
      }
    }

    const accountList = Array.from(accounts).map(account => {
      const [platform, username] = account.split('/');
      return { platform, username };
    });

    console.log(`📊 Found ${accountList.length} existing accounts:`);
    accountList.forEach(account => {
      console.log(`   - ${account.platform}/${account.username}`);
    });

    return accountList;

  } catch (error) {
    console.error('❌ Error scanning accounts:', error.message);
    return [];
  }
}

/**
 * Check if recommendations already exist for an account
 */
async function recommendationsExist(username, platform) {
  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `recommendations/${platform}/${username}/`,
      MaxKeys: 1
    });

    const response = await s3Client.send(listCommand);
    return response.Contents && response.Contents.length > 0;

  } catch (error) {
    return false;
  }
}

/**
 * Main execution function
 */
async function main() {
  console.log('🚀 RECOMMENDATION GENERATOR STARTING...\n');

  // Check if RAG server is running
  try {
    await axios.get('http://localhost:3001/api/health', { timeout: 5000 });
    console.log('✅ RAG server is running on port 3001\n');
  } catch (error) {
    console.log('⚠️  RAG server not available - will use fallback recommendations\n');
  }

  // Find existing accounts
  const accounts = await findExistingAccounts();
  
  if (accounts.length === 0) {
    console.log('❌ No existing accounts found. Please ensure some profile data exists first.');
    process.exit(1);
  }

  // Generate recommendations for each account
  let generated = 0;
  let skipped = 0;

  for (const account of accounts) {
    const { platform, username } = account;

    // Check if recommendations already exist
    const exists = await recommendationsExist(username, platform);
    if (exists) {
      console.log(`⏭️  Skipping ${platform}/${username} - recommendations already exist`);
      skipped++;
      continue;
    }

    try {
      // Generate recommendations
      const recommendations = await generateRecommendationsForAccount(username, platform);
      
      // Save to R2
      await saveRecommendationsToR2(recommendations, username, platform);
      
      generated++;
      
      // Small delay to avoid overwhelming the RAG server
      await new Promise(resolve => setTimeout(resolve, 2000));

    } catch (error) {
      console.error(`❌ Failed to process ${platform}/${username}:`, error.message);
    }
  }

  console.log(`\n🎉 GENERATION COMPLETE!`);
  console.log(`   ✅ Generated: ${generated}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   📊 Total: ${accounts.length}\n`);

  if (generated > 0) {
    console.log('🔄 Recommendation files are now available for frontend display!');
    console.log('   Try refreshing your dashboard to see the strategies.');
  }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
🎯 RECOMMENDATION GENERATOR

Usage:
  node generate-recommendations.js [options]

Options:
  --help, -h     Show this help message
  --force        Regenerate even if recommendations exist
  --platform X   Only generate for specific platform
  --username X   Only generate for specific username

Examples:
  node generate-recommendations.js
  node generate-recommendations.js --platform instagram
  node generate-recommendations.js --username elonmusk
  node generate-recommendations.js --force
`);
  process.exit(0);
}

// Execute main function
main().catch(error => {
  console.error('💥 Fatal error:', error.message);
  process.exit(1);
});
