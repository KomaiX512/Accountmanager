#!/usr/bin/env node

/**
 * Facebook Disconnect Helper Script
 * Helps disconnect current Facebook connection to allow reconnection with business page
 */

import 'dotenv/config';
import { S3Client, DeleteObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

const S3_CONFIG = {
  endpoint: process.env.R2_ENDPOINT,
  region: process.env.R2_REGION || 'auto',
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  }
};

const s3Client = new S3Client(S3_CONFIG);

async function disconnectFacebook(userId, options = {}) {
  const dryRun = options.dryRun || process.env.DRY_RUN === 'true';
  const bucket = options.bucket || process.env.R2_BUCKET || 'tasks';
  const providedPageId = options.pageId || null;
  const providedFbUserId = options.fbUserId || null;
  const scanAllTokens = !!options.scanAllTokens;

  console.log(`🔧 Disconnecting Facebook for app user: ${userId}`);
  console.log('='.repeat(50));

  // Validate required environment variables for S3/R2
  const missingEnv = [];
  if (!S3_CONFIG.endpoint) missingEnv.push('R2_ENDPOINT');
  if (!S3_CONFIG.credentials?.accessKeyId) missingEnv.push('R2_ACCESS_KEY_ID');
  if (!S3_CONFIG.credentials?.secretAccessKey) missingEnv.push('R2_SECRET_ACCESS_KEY');
  if (missingEnv.length) {
    console.error(`❌ Missing required environment variables: ${missingEnv.join(', ')}`);
    console.error(`   Please set them in your environment or .env file.`);
    return { success: false, error: `Missing env: ${missingEnv.join(', ')}` };
  }

  // Helper: read JSON object from S3
  const getJson = async (key) => {
    try {
      const res = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      const body = await new Promise((resolve, reject) => {
        const chunks = [];
        res.Body.on('data', (c) => chunks.push(c));
        res.Body.on('error', reject);
        res.Body.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      });
      return JSON.parse(body);
    } catch (e) {
      return null;
    }
  };

  // Helper: delete a key (honors dry-run)
  const deleteKey = async (key) => {
    try {
      if (dryRun) {
        console.log(`🟡 [dry-run] Would delete: ${key}`);
        return { deleted: false };
      }
      await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      console.log(`✅ Deleted: ${key}`);
      return { deleted: true };
    } catch (error) {
      console.log(`❌ Error deleting ${key}: ${error.message}`);
      return { deleted: false, error };
    }
  };

  try {
    const keysToDelete = new Set();
    let deletedCount = 0;
    let scannedMatches = 0;

    // Always remove the connection file and legacy token-by-app-user key
    const connectionKey = `FacebookConnection/${userId}/connection.json`;
    keysToDelete.add(connectionKey);
    keysToDelete.add(`FacebookTokens/${userId}/token.json`); // legacy / incorrect saves

    // Try to resolve actual pageId and facebook user id from connection.json
    const connection = await getJson(connectionKey);
    let resolved = {
      pageId: providedPageId || (connection && connection.facebook_page_id) || null,
      fbUserId: providedFbUserId || (connection && connection.facebook_user_id) || null,
      isPersonal: connection ? !!connection.is_personal_account : undefined,
    };

    if (resolved.pageId) keysToDelete.add(`FacebookTokens/${resolved.pageId}/token.json`);
    if (resolved.fbUserId) keysToDelete.add(`FacebookTokens/${resolved.fbUserId}/token.json`);
    if (providedPageId && providedPageId !== resolved.pageId) keysToDelete.add(`FacebookTokens/${providedPageId}/token.json`);
    if (providedFbUserId && providedFbUserId !== resolved.fbUserId) keysToDelete.add(`FacebookTokens/${providedFbUserId}/token.json`);

    // Optional: scan all tokens to catch any mis-saved entries
    if (scanAllTokens) {
      console.log('🔎 Scanning FacebookTokens/ for tokens linked to this user (may take time)...');
      let continuationToken = undefined;
      do {
        const listRes = await s3Client.send(new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: 'FacebookTokens/',
          ContinuationToken: continuationToken,
        }));
        const contents = listRes.Contents || [];
        for (const obj of contents) {
          if (!obj.Key.endsWith('/token.json')) continue;
          try {
            const tokenData = await getJson(obj.Key);
            if (!tokenData) continue;
            const matches = (
              tokenData.uid === userId || // extremely rare
              tokenData.user_id === userId || // legacy incorrect mapping
              (resolved.fbUserId && tokenData.user_id === resolved.fbUserId) ||
              (resolved.pageId && tokenData.page_id === resolved.pageId)
            );
            if (matches) {
              if (!keysToDelete.has(obj.Key)) scannedMatches++;
              keysToDelete.add(obj.Key);
            }
          } catch (_) {
            // ignore parse errors per object
          }
        }
        continuationToken = listRes.IsTruncated ? listRes.NextContinuationToken : undefined;
      } while (continuationToken);
    }

    // Execute deletions
    const totalTargets = keysToDelete.size;
    for (const key of keysToDelete) {
      const result = await deleteKey(key);
      if (result.deleted) deletedCount++;
    }

    console.log(`\n📊 Disconnect Summary:`);
    console.log(`  - Total keys ${dryRun ? 'targeted' : 'deleted'}: ${dryRun ? totalTargets : deletedCount}${dryRun ? ' (dry-run)' : ''}`);
    console.log(`  - User ID (app): ${userId}`);
    if (resolved.fbUserId) console.log(`  - Facebook user ID: ${resolved.fbUserId}`);
    if (resolved.pageId) console.log(`  - Page ID: ${resolved.pageId}`);
    if (scanAllTokens) console.log(`  - Tokens discovered via scan: ${scannedMatches}`);

    console.log(`\n${dryRun ? '✅ Dry-run completed.' : '✅ Facebook connection successfully disconnected!'}`);
    console.log(`\n📝 Next Steps:`);
    console.log(`  1. Go to your app and reconnect Facebook`);
    console.log(`  2. Select your BUSINESS PAGE (not personal account)`);
    console.log(`  3. Grant all required permissions`);

    return {
      success: true,
      deletedCount,
      userId,
      pageId: resolved.pageId || null,
      fbUserId: resolved.fbUserId || null,
      dryRun,
      scannedMatches,
    };

  } catch (error) {
    console.error(`\n❌ Disconnect failed:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

// Simple CLI argument parser
function parseArgs(argv) {
  const args = { dryRun: false, scanAllTokens: false };
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '-n') { args.dryRun = true; continue; }
    if ((a === '--page-id' || a === '-p') && argv[i + 1]) { args.pageId = argv[++i]; continue; }
    if ((a === '--fb-user-id' || a === '-f') && argv[i + 1]) { args.fbUserId = argv[++i]; continue; }
    if ((a === '--bucket' || a === '-b') && argv[i + 1]) { args.bucket = argv[++i]; continue; }
    if (a === '--scan-all' || a === '--scan') { args.scanAllTokens = true; continue; }
    if (a === '--help' || a === '-h') { args.help = true; continue; }
    positionals.push(a);
  }
  if (!args.userId && positionals.length > 0) args.userId = positionals[0];
  args._ = positionals;
  return args;
}

const args = parseArgs(process.argv.slice(2));
const userId = args.userId || '94THUToVmtdKGNcq4A5cTONerxI3';

if (args.help) {
  console.log(`\nUsage: node server/disconnect-facebook.js [userId] [options]\n`);
  console.log(`Options:`);
  console.log(`  -n, --dry-run            Do not delete, just show what would be deleted`);
  console.log(`  -p, --page-id <id>       Explicit Facebook Page ID to delete token for`);
  console.log(`  -f, --fb-user-id <id>    Explicit Facebook User ID to delete token for`);
  console.log(`  -b, --bucket <name>      S3/R2 bucket name (default: env R2_BUCKET or 'tasks')`);
  console.log(`      --scan-all           Scan all FacebookTokens for matches (slower)`);
  console.log(`  -h, --help               Show this help`);
  process.exit(0);
}

console.log(`🚀 Starting Facebook disconnect process...`);
console.log(`📝 User ID: ${userId}`);

disconnectFacebook(userId, {
  dryRun: args.dryRun,
  pageId: args.pageId,
  fbUserId: args.fbUserId,
  bucket: args.bucket,
  scanAllTokens: args.scanAllTokens,
})
  .then(result => {
    if (result.success) {
      console.log(`\n🎉 Disconnect completed successfully!`);
      console.log(`\n💡 Now reconnect your Facebook BUSINESS PAGE for full functionality.`);
    } else {
      console.log(`\n❌ Disconnect failed: ${result.error}`);
    }
  })
  .catch(error => {
    console.error(`\n💥 Script crashed:`, error.message);
  });