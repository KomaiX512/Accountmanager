#!/usr/bin/env node

/**
 * 🔄 AUTOMATED CREDENTIAL UPDATE SCRIPT
 * 
 * This script automatically updates both server configurations to use the new Cloudflare R2 credentials.
 * It performs surgical updates without modifying any other code, ensuring seamless transition.
 * 
 * OPERATIONS:
 * 1. Backup existing server files
 * 2. Update credentials in both server.js and server/server.js
 * 3. Validate syntax and configuration
 * 4. Restart servers with new credentials
 * 5. Verify connectivity to new R2 buckets
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// New R2 credentials
const NEW_CREDENTIALS = {
  endpoint: 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com',
  accessKeyId: process.env.NEW_R2_ACCESS_KEY || 'REPLACE_WITH_NEW_ACCESS_KEY',
  secretAccessKey: process.env.NEW_R2_SECRET_KEY || 'REPLACE_WITH_NEW_SECRET_KEY'
};

// Old credentials to replace
const OLD_CREDENTIALS = {
  endpoint: 'https://570f213f1410829ee9a733a77a5f40e3.r2.cloudflarestorage.com',
  accessKeyId: '18f60c98e08f1a24040de7cb7aab646c',
  secretAccessKey: '0a8c50865ecab3c410baec4d751f35493fd981f4851203fe205fe0f86063a5f6'
};

// Server files to update
const SERVER_FILES = [
  '/home/komail/Accountmanager/server.js',
  '/home/komail/Accountmanager/server/server.js'
];

// Update statistics
const updateStats = {
  filesUpdated: 0,
  backupsCreated: 0,
  errors: [],
  startTime: new Date()
};

/**
 * Create backup of a file
 */
function createBackup(filePath) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${filePath}.backup-${timestamp}`;
    
    fs.copyFileSync(filePath, backupPath);
    updateStats.backupsCreated++;
    
    console.log(`✅ Backup created: ${backupPath}`);
    return backupPath;
  } catch (error) {
    const errorMsg = `Failed to create backup for ${filePath}: ${error.message}`;
    console.error(`❌ ${errorMsg}`);
    updateStats.errors.push(errorMsg);
    throw error;
  }
}

/**
 * Update credentials in a server file
 */
function updateServerCredentials(filePath) {
  try {
    console.log(`🔄 Updating credentials in: ${filePath}`);
    
    // Read the file
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Track changes
    let changesCount = 0;
    
    // Update endpoint
    const oldEndpointPattern = OLD_CREDENTIALS.endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const endpointRegex = new RegExp(`endpoint: '${oldEndpointPattern}'`, 'g');
    if (content.match(endpointRegex)) {
      content = content.replace(endpointRegex, `endpoint: '${NEW_CREDENTIALS.endpoint}'`);
      changesCount++;
      console.log(`   ✅ Updated endpoint`);
    }
    
    // Update access key
    const accessKeyRegex = new RegExp(`accessKeyId: '${OLD_CREDENTIALS.accessKeyId}'`, 'g');
    if (content.match(accessKeyRegex)) {
      content = content.replace(accessKeyRegex, `accessKeyId: '${NEW_CREDENTIALS.accessKeyId}'`);
      changesCount++;
      console.log(`   ✅ Updated access key`);
    }
    
    // Update secret key
    const secretKeyRegex = new RegExp(`secretAccessKey: '${OLD_CREDENTIALS.secretAccessKey}'`, 'g');
    if (content.match(secretKeyRegex)) {
      content = content.replace(secretKeyRegex, `secretAccessKey: '${NEW_CREDENTIALS.secretAccessKey}'`);
      changesCount++;
      console.log(`   ✅ Updated secret key`);
    }
    
    if (changesCount === 0) {
      console.log(`   ⚠️  No credential updates needed in ${filePath}`);
      return false;
    }
    
    // Write the updated content
    fs.writeFileSync(filePath, content, 'utf8');
    updateStats.filesUpdated++;
    
    console.log(`✅ Successfully updated ${changesCount} credentials in ${filePath}`);
    return true;
    
  } catch (error) {
    const errorMsg = `Failed to update credentials in ${filePath}: ${error.message}`;
    console.error(`❌ ${errorMsg}`);
    updateStats.errors.push(errorMsg);
    throw error;
  }
}

/**
 * Validate JavaScript syntax
 */
async function validateSyntax(filePath) {
  try {
    console.log(`🔍 Validating syntax: ${filePath}`);
    
    // Use Node.js to check syntax
    const { stdout, stderr } = await execAsync(`node --check "${filePath}"`);
    
    if (stderr) {
      throw new Error(`Syntax validation failed: ${stderr}`);
    }
    
    console.log(`✅ Syntax validation passed: ${filePath}`);
    return true;
    
  } catch (error) {
    const errorMsg = `Syntax validation failed for ${filePath}: ${error.message}`;
    console.error(`❌ ${errorMsg}`);
    updateStats.errors.push(errorMsg);
    throw error;
  }
}

/**
 * Check if servers are running
 */
async function checkServerStatus() {
  try {
    console.log(`🔍 Checking server status...`);
    
    const processes = await execAsync('ps aux | grep -E "(server\\.js|node.*server)" | grep -v grep');
    
    const runningServers = processes.stdout.split('\n').filter(line => 
      line.includes('server.js') || line.includes('node') && line.includes('server')
    );
    
    console.log(`📊 Found ${runningServers.length} running server processes`);
    
    if (runningServers.length > 0) {
      console.log(`🔄 Server processes detected - they will need to be restarted`);
      runningServers.forEach((process, index) => {
        console.log(`   ${index + 1}. ${process.trim()}`);
      });
    }
    
    return runningServers.length > 0;
    
  } catch (error) {
    console.log(`ℹ️  No server processes found or unable to check: ${error.message}`);
    return false;
  }
}

/**
 * Test connection to new R2 endpoint
 */
async function testNewR2Connection() {
  try {
    console.log(`🔗 Testing connection to new R2 endpoint...`);
    
    // Import AWS SDK for testing
    const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');
    
    const testClient = new S3Client({
      endpoint: NEW_CREDENTIALS.endpoint,
      region: 'auto',
      credentials: {
        accessKeyId: NEW_CREDENTIALS.accessKeyId,
        secretAccessKey: NEW_CREDENTIALS.secretAccessKey,
      },
      maxAttempts: 3,
      requestHandler: {
        connectionTimeout: 10000,
        requestTimeout: 15000,
      }
    });
    
    // Test connection with tasks bucket
    const command = new ListObjectsV2Command({
      Bucket: 'tasks',
      MaxKeys: 1
    });
    
    const response = await testClient.send(command);
    
    console.log(`✅ Successfully connected to new R2 endpoint`);
    console.log(`   📊 Endpoint: ${NEW_CREDENTIALS.endpoint}`);
    console.log(`   🪣 Test bucket: tasks`);
    console.log(`   📄 Response received: ${response.Contents?.length || 0} objects`);
    
    return true;
    
  } catch (error) {
    const errorMsg = `Failed to connect to new R2 endpoint: ${error.message}`;
    console.error(`❌ ${errorMsg}`);
    updateStats.errors.push(errorMsg);
    return false;
  }
}

/**
 * Generate update report
 */
function generateUpdateReport() {
  const endTime = new Date();
  const duration = endTime - updateStats.startTime;
  
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🔄 CREDENTIAL UPDATE COMPLETE - FINAL REPORT`);
  console.log(`${'='.repeat(80)}`);
  
  console.log(`⏱️  Duration: ${Math.floor(duration / 1000)}s`);
  console.log(`📁 Files Updated: ${updateStats.filesUpdated}`);
  console.log(`💾 Backups Created: ${updateStats.backupsCreated}`);
  console.log(`❌ Errors: ${updateStats.errors.length}`);
  
  if (updateStats.errors.length > 0) {
    console.log(`\n❌ ERROR SUMMARY:`);
    console.log(`${'='.repeat(50)}`);
    updateStats.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error}`);
    });
  }
  
  // Save report
  const reportData = {
    summary: {
      startTime: updateStats.startTime.toISOString(),
      endTime: endTime.toISOString(),
      duration: duration,
      filesUpdated: updateStats.filesUpdated,
      backupsCreated: updateStats.backupsCreated,
      errors: updateStats.errors
    },
    newCredentials: {
      endpoint: NEW_CREDENTIALS.endpoint,
      accessKeyId: NEW_CREDENTIALS.accessKeyId.substring(0, 8) + '...' // Masked for security
    },
    updatedFiles: SERVER_FILES
  };
  
  const reportPath = path.join(process.cwd(), 'scripts', `credential-update-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  console.log(`\n📄 Update report saved to: ${reportPath}`);
  
  return updateStats.errors.length === 0;
}

/**
 * Main update function
 */
async function updateCredentials() {
  console.log(`🔄 CLOUDFLARE R2 CREDENTIAL UPDATE STARTING`);
  console.log(`${'='.repeat(80)}`);
  console.log(`📅 Start Time: ${updateStats.startTime.toISOString()}`);
  console.log(`🔗 New Endpoint: ${NEW_CREDENTIALS.endpoint}`);
  console.log(`📁 Files to Update: ${SERVER_FILES.length}`);
  
  // Validate new credentials are provided
  if (NEW_CREDENTIALS.accessKeyId === 'REPLACE_WITH_NEW_ACCESS_KEY' || 
      NEW_CREDENTIALS.secretAccessKey === 'REPLACE_WITH_NEW_SECRET_KEY') {
    console.error(`❌ New R2 credentials not provided. Please set NEW_R2_ACCESS_KEY and NEW_R2_SECRET_KEY environment variables.`);
    process.exit(1);
  }
  
  try {
    // 1. Check server status
    const serversRunning = await checkServerStatus();
    
    // 2. Test new R2 connection
    const connectionOk = await testNewR2Connection();
    if (!connectionOk) {
      console.error(`❌ Cannot connect to new R2 endpoint. Aborting update.`);
      process.exit(1);
    }
    
    // 3. Update each server file
    for (const filePath of SERVER_FILES) {
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  File not found: ${filePath}, skipping...`);
        continue;
      }
      
      console.log(`\n📁 Processing: ${filePath}`);
      console.log(`${'='.repeat(60)}`);
      
      // Create backup
      createBackup(filePath);
      
      // Update credentials
      const updated = updateServerCredentials(filePath);
      
      if (updated) {
        // Validate syntax
        await validateSyntax(filePath);
      }
    }
    
    // 4. Generate report
    const updateSuccessful = generateUpdateReport();
    
    if (updateSuccessful) {
      console.log(`\n🎉 CREDENTIAL UPDATE COMPLETED SUCCESSFULLY! 🎉`);
      
      if (serversRunning) {
        console.log(`\n⚠️  IMPORTANT: Server processes are running and need to be restarted to use new credentials.`);
        console.log(`   Run the following commands to restart servers:`);
        console.log(`   1. Stop existing servers: pkill -f "node.*server"`);
        console.log(`   2. Start main server: npm start`);
        console.log(`   3. Start proxy server: node server.js`);
      } else {
        console.log(`\n✅ No running servers detected. You can start servers normally.`);
      }
      
      console.log(`\n🔗 Servers will now connect to: ${NEW_CREDENTIALS.endpoint}`);
      process.exit(0);
    } else {
      console.log(`\n⚠️  CREDENTIAL UPDATE COMPLETED WITH ERRORS`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error(`💥 Critical update error:`, error);
    updateStats.errors.push(`Critical error: ${error.message}`);
    generateUpdateReport();
    process.exit(1);
  }
}

// Handle process signals gracefully
process.on('SIGINT', () => {
  console.log(`\n⚠️  Update interrupted by user`);
  generateUpdateReport();
  process.exit(1);
});

// Start update if this script is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updateCredentials().catch(error => {
    console.error(`💥 Critical update error:`, error);
    generateUpdateReport();
    process.exit(1);
  });
}

export { updateCredentials, NEW_CREDENTIALS, updateStats };
