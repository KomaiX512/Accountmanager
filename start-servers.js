// Node.js script to start all servers
import { spawn } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import os from 'os';

// Function to get free port
const getPort = async (startPort) => {
  return startPort; // For simplicity, we're just returning the default ports
};

// Create logs directory
const logsDir = join(process.cwd(), 'logs');
if (!existsSync(logsDir)) {
  mkdirSync(logsDir, { recursive: true });
}

// Define server configs
const servers = [
  {
    name: 'Main Server',
    command: os.platform() === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'dev'],
    defaultPort: 3000,
    logFile: join(logsDir, 'main-server.log')
  },
  {
    name: 'RAG Server',
    command: 'node',
    args: ['rag-server.js'],
    defaultPort: 3001,
    logFile: join(logsDir, 'rag-server.log')
  },
  {
    name: 'Image Server',
    command: 'node',
    args: ['server.js'],
    defaultPort: 3002,
    logFile: join(logsDir, 'image-server.log')
  }
];

// Kill existing processes (Windows vs Unix)
const killProcess = (port) => {
  console.log(`Attempting to kill process on port ${port}...`);
  
  try {
    if (os.platform() === 'win32') {
      spawn('cmd.exe', ['/c', `FOR /F "tokens=5" %P IN ('netstat -a -n -o ^| findstr :${port}') DO taskkill /F /PID %P`]);
    } else {
      spawn('sh', ['-c', `lsof -ti:${port} | xargs -r kill -9`]);
    }
    console.log(`Process on port ${port} terminated.`);
  } catch (err) {
    console.error(`Error killing process on port ${port}:`, err.message);
  }
};

// Try to kill any existing processes
servers.forEach(server => killProcess(server.defaultPort));

// Wait a bit for processes to terminate
console.log('Waiting for processes to terminate...');
setTimeout(startServers, 2000);

// Function to start all servers
function startServers() {
  console.log('Starting all servers...');
  
  // Start each server
  servers.forEach(async (server) => {
    try {
      const port = await getPort(server.defaultPort);
      
      console.log(`Starting ${server.name} on port ${port}...`);
      
      const serverProcess = spawn(server.command, server.args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true
      });
      
      let started = false;
      
      serverProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log(`[${server.name}] ${output.trim()}`);
        
        if (!started && output.includes('running at') || output.includes('started') || output.includes('listening')) {
          console.log(`✅ ${server.name} is now running on port ${port}`);
          started = true;
        }
      });
      
      serverProcess.stderr.on('data', (data) => {
        console.error(`[${server.name} ERROR] ${data.toString().trim()}`);
      });
      
      serverProcess.on('error', (err) => {
        console.error(`Failed to start ${server.name}:`, err.message);
      });
      
      serverProcess.on('close', (code) => {
        if (code !== 0) {
          console.log(`${server.name} process exited with code ${code}`);
        }
      });
      
      // Don't wait for child to exit
      serverProcess.unref();
      
    } catch (err) {
      console.error(`Error starting ${server.name}:`, err.message);
    }
  });
  
  console.log('\nAll servers should now be starting up...');
  console.log('Server logs will appear above. Press Ctrl+C to stop all servers.');
  console.log('\nOpen http://localhost:5173 or http://127.0.0.1:5173 in your browser');
}

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nStopping all servers...');
  servers.forEach(server => killProcess(server.defaultPort));
  process.exit(0);
}); 