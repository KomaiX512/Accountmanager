# Server Management for AccountManager

This document explains how to start and stop the server infrastructure required for the AccountManager application.

## Server Components

AccountManager requires three servers to be running:

1. **Main Server (port 3000)**: The primary API server
2. **RAG Server (port 3001)**: Handles AI-based content generation
3. **Image Server (port 3002)**: Manages image generation and storage

## Starting All Servers

Choose the appropriate method based on your operating system:

### Linux/Mac:

```bash
# Using npm script (recommended)
npm run start-all

# Or directly using the shell script
./start-servers.sh
```

### Windows:

```bash
# Using npm script
npm run start-all:win

# Or directly using the batch file
start-servers.bat
```

### Cross-platform (Node.js):

```bash
# Using npm script
npm run start-all:node

# Or directly using Node.js
node start-servers.js
```

## Stopping All Servers

Choose the appropriate method based on your operating system:

### Linux/Mac:

```bash
# Using npm script (recommended)
npm run stop-all

# Or directly using the shell script
./stop-servers.sh
```

### Windows:

```bash
# Using npm script
npm run stop-all:win

# Or directly using the batch file
stop-servers.bat
```

## Testing CORS Configuration

If you're experiencing CORS issues, you can test your server configuration with:

```bash
npm run test-cors
```

This will check if the servers are properly configured to handle cross-origin requests.

## Starting Individual Servers

If needed, you can start each server individually:

```bash
# Main Server (port 3000)
npm run start-main

# RAG Server (port 3001)
npm run start-rag

# Image Server (port 3002)
npm run start-proxy
```

## Troubleshooting

### CORS Issues

If you encounter CORS errors like:

```
Cross-Origin Request Blocked: The Same Origin Policy disallows reading the remote resource...
```

Try the following:

1. Make sure all three servers are running
2. Verify that the servers are accessible at their respective ports
3. Run `npm run test-cors` to check CORS configuration
4. Restart all servers using the appropriate start-all command

### Port Already in Use

If you see errors like "port already in use", run the stop script first:

```bash
# Linux/Mac
npm run stop-all

# Windows
npm run stop-all:win
```

Then try starting the servers again.

### Image Generation Issues

If posts are created but images fail to generate or display, check:

1. Image server logs for error messages
2. Network tab in browser developer tools for failed requests
3. The file paths in the server.js configuration 