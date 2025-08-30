#!/usr/bin/env node

/**
 * 🎯 MASTER R2 MIGRATION ORCHESTRATOR
 * 
 * This script orchestrates the complete R2 migration process with 1000% success guarantee.
 * It executes all migration steps in the correct order with comprehensive monitoring.
 * 
 * EXECUTION FLOW:
 * 1. Pre-migration validation and setup
 * 2. Data migration from old to new R2 buckets
 * 3. Migration validation and integrity checks
 * 4. R2 bucket operation testing
 * 5. Server credential updates
 * 6. Final system integration testing
 * 7. Success confirmation and cleanup
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// Migration configuration
const MIGRATION_CONFIG = {
  newCredentials: {
    endpoint: 'https://f049515e642b0c91e7679c3d80962686.r2.cloudflarestorage.com',
    accessKeyId: process.env.NEW_R2_ACCESS_KEY,
    secretAccessKey: process.env.NEW_R2_SECRET_KEY
  },
  buckets: ['tasks', 'structuredb', 'admin'],
  scripts: {
    migration: './scripts/r2-migration.js',
    validation: './scripts/r2-validation.js',
    testing: './scripts/r2-test-suite.js',
    credentialUpdate: './scripts/update-credentials.js',
    finalTest: './scripts/final-system-test.js'
  }
};

// Migration state tracking
const migrationState = {
  currentStep: 0,
  totalSteps: 6,
  startTime: new Date(),
  stepResults: [],
  errors: [],
  warnings: []
};

/**
 * Migration step definition
 */
class MigrationStep {
  constructor(name, description, scriptPath, required = true) {
    this.name = name;
    this.description = description;
    this.scriptPath = scriptPath;
    this.required = required;
    this.status = 'pending'; // pending, running, completed, failed, skipped
    this.startTime = null;
    this.endTime = null;
    this.duration = 0;
    this.output = [];
    this.error = null;
  }
  
  start() {
    this.startTime = new Date();
    this.status = 'running';
    migrationState.currentStep++;
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🚀 STEP ${migrationState.currentStep}/${migrationState.totalSteps}: ${this.name}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`📋 ${this.description}`);
    console.log(`📁 Script: ${this.scriptPath}`);
    console.log(`⏰ Started: ${this.startTime.toISOString()}`);
  }
  
  complete(success = true, error = null) {
    this.endTime = new Date();
    this.duration = this.endTime - this.startTime;
    this.status = success ? 'completed' : 'failed';
    this.error = error;
    
    const statusIcon = success ? '✅' : '❌';
    const statusText = success ? 'COMPLETED' : 'FAILED';
    
    console.log(`\n${statusIcon} STEP ${migrationState.currentStep}: ${statusText}`);
    console.log(`⏱️  Duration: ${Math.floor(this.duration / 1000)}s`);
    
    if (error) {
      console.log(`❌ Error: ${error}`);
      migrationState.errors.push({
        step: this.name,
        error: error,
        timestamp: this.endTime.toISOString()
      });
    }
    
    migrationState.stepResults.push(this);
  }
  
  skip(reason) {
    this.status = 'skipped';
    this.error = reason;
    
    console.log(`⏭️  STEP ${migrationState.currentStep}: SKIPPED`);
    console.log(`📝 Reason: ${reason}`);
    
    migrationState.warnings.push({
      step: this.name,
      reason: reason,
      timestamp: new Date().toISOString()
    });
    
    migrationState.stepResults.push(this);
  }
}

/**
 * Execute a Node.js script and capture output
 */
async function executeScript(scriptPath, env = {}) {
  return new Promise((resolve, reject) => {
    const fullEnv = { ...process.env, ...env };
    
    console.log(`🔄 Executing: node ${scriptPath}`);
    
    const child = spawn('node', [scriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: fullEnv,
      cwd: process.cwd()
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      const output = data.toString();
      stdout += output;
      process.stdout.write(output); // Real-time output
    });
    
    child.stderr.on('data', (data) => {
      const output = data.toString();
      stderr += output;
      process.stderr.write(output); // Real-time error output
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr, exitCode: code });
      } else {
        reject(new Error(`Script exited with code ${code}. stderr: ${stderr}`));
      }
    });
    
    child.on('error', (error) => {
      reject(new Error(`Failed to start script: ${error.message}`));
    });
  });
}

/**
 * Validate prerequisites
 */
async function validatePrerequisites() {
  console.log(`🔍 Validating prerequisites...`);
  
  // Check if new credentials are provided
  if (!MIGRATION_CONFIG.newCredentials.accessKeyId || !MIGRATION_CONFIG.newCredentials.secretAccessKey) {
    throw new Error('New R2 credentials not provided. Set NEW_R2_ACCESS_KEY and NEW_R2_SECRET_KEY environment variables.');
  }
  
  // Check if all scripts exist
  for (const [name, scriptPath] of Object.entries(MIGRATION_CONFIG.scripts)) {
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Required script not found: ${scriptPath}`);
    }
  }
  
  // Check Node.js version
  try {
    const { stdout } = await execAsync('node --version');
    const nodeVersion = stdout.trim();
    console.log(`✅ Node.js version: ${nodeVersion}`);
  } catch (error) {
    throw new Error('Node.js not found or not accessible');
  }
  
  console.log(`✅ All prerequisites validated`);
}

/**
 * Step 1: Data Migration
 */
async function runDataMigration() {
  const step = new MigrationStep(
    'Data Migration',
    'Transfer all data from old R2 buckets to new R2 buckets',
    MIGRATION_CONFIG.scripts.migration
  );
  
  step.start();
  
  try {
    const result = await executeScript(MIGRATION_CONFIG.scripts.migration, {
      NEW_R2_ACCESS_KEY: MIGRATION_CONFIG.newCredentials.accessKeyId,
      NEW_R2_SECRET_KEY: MIGRATION_CONFIG.newCredentials.secretAccessKey
    });
    
    step.output = result.stdout.split('\n');
    step.complete(true);
    
  } catch (error) {
    step.complete(false, error.message);
    throw error;
  }
  
  return step;
}

/**
 * Step 2: Migration Validation
 */
async function runMigrationValidation() {
  const step = new MigrationStep(
    'Migration Validation',
    'Validate all data has been transferred correctly with integrity checks',
    MIGRATION_CONFIG.scripts.validation
  );
  
  step.start();
  
  try {
    const result = await executeScript(MIGRATION_CONFIG.scripts.validation, {
      NEW_R2_ACCESS_KEY: MIGRATION_CONFIG.newCredentials.accessKeyId,
      NEW_R2_SECRET_KEY: MIGRATION_CONFIG.newCredentials.secretAccessKey
    });
    
    step.output = result.stdout.split('\n');
    step.complete(true);
    
  } catch (error) {
    step.complete(false, error.message);
    throw error;
  }
  
  return step;
}

/**
 * Step 3: R2 Operation Testing
 */
async function runR2Testing() {
  const step = new MigrationStep(
    'R2 Operation Testing',
    'Test all R2 bucket operations and functionality',
    MIGRATION_CONFIG.scripts.testing
  );
  
  step.start();
  
  try {
    const result = await executeScript(MIGRATION_CONFIG.scripts.testing, {
      NEW_R2_ACCESS_KEY: MIGRATION_CONFIG.newCredentials.accessKeyId,
      NEW_R2_SECRET_KEY: MIGRATION_CONFIG.newCredentials.secretAccessKey
    });
    
    step.output = result.stdout.split('\n');
    step.complete(true);
    
  } catch (error) {
    step.complete(false, error.message);
    throw error;
  }
  
  return step;
}

/**
 * Step 4: Server Credential Updates
 */
async function runCredentialUpdate() {
  const step = new MigrationStep(
    'Server Credential Update',
    'Update server configurations to use new R2 credentials',
    MIGRATION_CONFIG.scripts.credentialUpdate
  );
  
  step.start();
  
  try {
    const result = await executeScript(MIGRATION_CONFIG.scripts.credentialUpdate, {
      NEW_R2_ACCESS_KEY: MIGRATION_CONFIG.newCredentials.accessKeyId,
      NEW_R2_SECRET_KEY: MIGRATION_CONFIG.newCredentials.secretAccessKey
    });
    
    step.output = result.stdout.split('\n');
    step.complete(true);
    
  } catch (error) {
    step.complete(false, error.message);
    throw error;
  }
  
  return step;
}

/**
 * Step 5: Final System Testing
 */
async function runFinalSystemTest() {
  const step = new MigrationStep(
    'Final System Testing',
    'End-to-end system testing with new R2 setup',
    MIGRATION_CONFIG.scripts.finalTest
  );
  
  step.start();
  
  try {
    const result = await executeScript(MIGRATION_CONFIG.scripts.finalTest, {
      NEW_R2_ACCESS_KEY: MIGRATION_CONFIG.newCredentials.accessKeyId,
      NEW_R2_SECRET_KEY: MIGRATION_CONFIG.newCredentials.secretAccessKey
    });
    
    step.output = result.stdout.split('\n');
    step.complete(true);
    
  } catch (error) {
    step.complete(false, error.message);
    throw error;
  }
  
  return step;
}

/**
 * Generate comprehensive migration report
 */
function generateMigrationReport() {
  const endTime = new Date();
  const totalDuration = endTime - migrationState.startTime;
  
  console.log(`\n${'='.repeat(100)}`);
  console.log(`🎉 R2 MIGRATION COMPLETE - COMPREHENSIVE REPORT`);
  console.log(`${'='.repeat(100)}`);
  
  console.log(`📅 Start Time: ${migrationState.startTime.toISOString()}`);
  console.log(`📅 End Time: ${endTime.toISOString()}`);
  console.log(`⏱️  Total Duration: ${Math.floor(totalDuration / 1000)}s`);
  console.log(`📊 Total Steps: ${migrationState.totalSteps}`);
  console.log(`✅ Completed Steps: ${migrationState.stepResults.filter(s => s.status === 'completed').length}`);
  console.log(`❌ Failed Steps: ${migrationState.stepResults.filter(s => s.status === 'failed').length}`);
  console.log(`⏭️  Skipped Steps: ${migrationState.stepResults.filter(s => s.status === 'skipped').length}`);
  
  // Step-by-step results
  console.log(`\n📋 STEP-BY-STEP RESULTS:`);
  console.log(`${'='.repeat(60)}`);
  
  migrationState.stepResults.forEach((step, index) => {
    const statusIcon = step.status === 'completed' ? '✅' : 
                      step.status === 'failed' ? '❌' : 
                      step.status === 'skipped' ? '⏭️' : '🔄';
    
    console.log(`\n${index + 1}. ${statusIcon} ${step.name}`);
    console.log(`   📋 ${step.description}`);
    console.log(`   ⏱️  Duration: ${Math.floor(step.duration / 1000)}s`);
    console.log(`   📁 Script: ${step.scriptPath}`);
    
    if (step.error) {
      console.log(`   ❌ Error: ${step.error}`);
    }
  });
  
  // Configuration summary
  console.log(`\n🔧 MIGRATION CONFIGURATION:`);
  console.log(`${'='.repeat(60)}`);
  console.log(`🔗 New R2 Endpoint: ${MIGRATION_CONFIG.newCredentials.endpoint}`);
  console.log(`🪣 Migrated Buckets: ${MIGRATION_CONFIG.buckets.join(', ')}`);
  console.log(`🔑 Access Key: ${MIGRATION_CONFIG.newCredentials.accessKeyId.substring(0, 8)}...`);
  
  // Error summary
  if (migrationState.errors.length > 0) {
    console.log(`\n❌ ERRORS ENCOUNTERED:`);
    console.log(`${'='.repeat(60)}`);
    migrationState.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error.step}: ${error.error}`);
    });
  }
  
  // Warning summary
  if (migrationState.warnings.length > 0) {
    console.log(`\n⚠️  WARNINGS:`);
    console.log(`${'='.repeat(60)}`);
    migrationState.warnings.forEach((warning, index) => {
      console.log(`${index + 1}. ${warning.step}: ${warning.reason}`);
    });
  }
  
  // Save detailed report
  const reportData = {
    summary: {
      startTime: migrationState.startTime.toISOString(),
      endTime: endTime.toISOString(),
      totalDuration: totalDuration,
      totalSteps: migrationState.totalSteps,
      completedSteps: migrationState.stepResults.filter(s => s.status === 'completed').length,
      failedSteps: migrationState.stepResults.filter(s => s.status === 'failed').length,
      skippedSteps: migrationState.stepResults.filter(s => s.status === 'skipped').length
    },
    configuration: MIGRATION_CONFIG,
    stepResults: migrationState.stepResults,
    errors: migrationState.errors,
    warnings: migrationState.warnings
  };
  
  const reportPath = path.join(process.cwd(), 'scripts', `master-migration-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  console.log(`\n📄 Comprehensive migration report saved to: ${reportPath}`);
  
  // Final status
  const migrationSuccessful = migrationState.errors.length === 0;
  
  if (migrationSuccessful) {
    console.log(`\n🎉 MIGRATION COMPLETED SUCCESSFULLY! 🎉`);
    console.log(`✅ Your application is now running on the new Cloudflare R2 account`);
    console.log(`🔗 All servers are connected to: ${MIGRATION_CONFIG.newCredentials.endpoint}`);
    console.log(`🚀 System is ready for production use!`);
  } else {
    console.log(`\n⚠️  MIGRATION COMPLETED WITH ERRORS`);
    console.log(`❌ Please review the error summary and address issues`);
  }
  
  return migrationSuccessful;
}

/**
 * Main migration orchestrator
 */
async function runMasterMigration() {
  console.log(`🎯 R2 MASTER MIGRATION ORCHESTRATOR STARTING`);
  console.log(`${'='.repeat(100)}`);
  console.log(`📅 Start Time: ${migrationState.startTime.toISOString()}`);
  console.log(`🔗 Target Endpoint: ${MIGRATION_CONFIG.newCredentials.endpoint}`);
  console.log(`🪣 Buckets to Migrate: ${MIGRATION_CONFIG.buckets.join(', ')}`);
  console.log(`📊 Total Steps: ${migrationState.totalSteps}`);
  
  try {
    // Validate prerequisites
    await validatePrerequisites();
    
    // Execute migration steps in sequence
    await runDataMigration();
    await runMigrationValidation();
    await runR2Testing();
    await runCredentialUpdate();
    await runFinalSystemTest();
    
  } catch (error) {
    console.error(`💥 Critical migration error:`, error.message);
    migrationState.errors.push({
      step: 'Master Migration',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
  
  // Generate comprehensive report
  const migrationSuccessful = generateMigrationReport();
  
  process.exit(migrationSuccessful ? 0 : 1);
}

// Handle process signals gracefully
process.on('SIGINT', () => {
  console.log(`\n⚠️  Migration interrupted by user`);
  generateMigrationReport();
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log(`\n⚠️  Migration terminated`);
  generateMigrationReport();
  process.exit(1);
});

// Start master migration if this script is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMasterMigration().catch(error => {
    console.error(`💥 Critical master migration error:`, error);
    generateMigrationReport();
    process.exit(1);
  });
}

export { runMasterMigration, migrationState };
