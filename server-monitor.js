#!/usr/bin/env node
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SERVER_SCRIPT = 'server.js';
const MAX_RESTARTS = 100;
const RESTART_DELAY = 5000; // 5 seconds
const UPTIME_LOG = 'server-uptime.log';
const CRASH_LOG = 'server-crash.log';

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Helper function to timestamp logs
function timestamp() {
  return new Date().toISOString();
}

// Helper function to log messages
function log(message) {
  const logMessage = `[${timestamp()}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(path.join(logsDir, UPTIME_LOG), logMessage + '\n');
}

// Helper function to log crashes
function logCrash(code, signal) {
  const crashMessage = `[${timestamp()}] Server crashed with code ${code} and signal ${signal}`;
  console.error(crashMessage);
  fs.appendFileSync(path.join(logsDir, CRASH_LOG), crashMessage + '\n');
}

// Start server function
function startServer() {
  log('Starting server...');
  
  // Spawn the server process
  const server = spawn('node', [SERVER_SCRIPT], {
    stdio: 'inherit',
    env: { ...process.env, FORCE_COLOR: '1' } // Preserve color output
  });
  
  // Track server state
  let hasExited = false;
  
  // Handle server exit
  server.on('exit', (code, signal) => {
    hasExited = true;
    logCrash(code, signal);
    handleExit(code, signal);
  });
  
  // Handle server errors
  server.on('error', (err) => {
    if (!hasExited) {
      hasExited = true;
      logCrash(1, 'ERROR');
      console.error(`[${timestamp()}] Failed to start server:`, err);
      handleExit(1);
    }
  });
  
  return server;
}

// Keep track of restart attempts
let restartCount = 0;
let lastRestartTime = 0;

// Handle server exit
function handleExit(code, signal) {
  // If the server exited cleanly (code 0), we don't need to restart
  if (code === 0) {
    log('Server exited cleanly. Not restarting.');
    process.exit(0);
    return;
  }
  
  // Calculate time since last restart
  const now = Date.now();
  const timeSinceLastRestart = now - lastRestartTime;
  
  // If the server has been running for a while (> 10 minutes), reset the restart counter
  if (timeSinceLastRestart > 10 * 60 * 1000) {
    restartCount = 0;
    log('Server was running for a while before crashing. Resetting restart counter.');
  }
  
  // Increment restart counter
  restartCount++;
  
  // Check if we've reached the maximum number of restarts
  if (restartCount > MAX_RESTARTS) {
    log(`Maximum restart attempts (${MAX_RESTARTS}) exceeded. Giving up.`);
    process.exit(1);
    return;
  }
  
  // Calculate delay based on restart count (exponential backoff)
  let delay = Math.min(RESTART_DELAY * Math.pow(1.5, restartCount - 1), 60000);
  
  log(`Server crashed with code ${code} and signal ${signal}. Restarting in ${delay}ms (attempt ${restartCount}/${MAX_RESTARTS})...`);
  
  // Schedule restart
  setTimeout(() => {
    lastRestartTime = Date.now();
    startServer();
  }, delay);
}

// Handle monitor process signals
process.on('SIGINT', () => {
  log('Received SIGINT. Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  log('Received SIGTERM. Shutting down...');
  process.exit(0);
});

// Start the server for the first time
log('Image proxy server monitor starting...');
startServer(); 