# Playwright MCP Setup for AccountManager

This document explains how to use Playwright MCP (Model Context Protocol) with GitHub Copilot for debugging your AccountManager web application.

## What is Playwright MCP?

Playwright MCP is a server that provides Playwright testing tools to AI agents (like GitHub Copilot) through the Model Context Protocol. This allows Copilot to:

- Automatically reproduce bugs by walking through user-reported steps
- Validate fixes by testing them in a real browser
- Interact with your website to understand its behavior
- Generate and run end-to-end tests

## Configuration Files

### 1. VS Code MCP Configuration (`.vscode/mcp.json`)

```json
{
  "servers": {
    "playwright": {
      "command": "npx",
      "args": [
        "@playwright/mcp@latest"
      ]
    }
  }
}
```

This file tells VS Code how to start the Playwright MCP server.

### 2. Playwright Configuration (`playwright.config.js`)

The configuration is set up for your multi-server architecture:

- **Frontend**: Vite dev server on port 5173
- **Main Server**: Node.js server on port 3000
- **RAG Server**: Node.js server on port 3001  
- **Proxy Server**: Node.js server on port 3002

The config uses `npm run dev` to start all services and focuses on Chromium for testing.

## How to Use

### 1. Start the MCP Server

In VS Code, you'll see a small **play** button next to "playwright" in the `.vscode/mcp.json` file. Click it to start the MCP server.

### 2. Use with GitHub Copilot Agent Mode

Once the MCP server is running, you can use prompts like:

```
A user is reporting that the publisher filter doesn't work. Can you please use Playwright to confirm this is an issue, and if so track it down? Start by going to the landing page, using the dropdown for publisher, and seeing what happens.
```

### 3. Available Test Commands

```bash
# Run all end-to-end tests
npm run test:e2e

# Run tests with UI (interactive mode)
npm run test:e2e:ui

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# Debug tests step by step
npm run test:e2e:debug
```

## Example Test File

The `tests/example.spec.js` file contains basic tests for:

- Homepage loading
- Health check endpoints
- API accessibility

## Architecture Integration

Your AccountManager app has a complex multi-server setup:

1. **Frontend (Port 5173)**: React + Vite development server
2. **Main Server (Port 3000)**: Core API server (`server/server.js`)
3. **RAG Server (Port 3001)**: AI/ML processing server (`rag-server.js`)
4. **Proxy Server (Port 3002)**: Image and post processing server (`server.js`)

The Playwright configuration handles this by:
- Using `npm run dev` to start all services
- Setting the base URL to the frontend (port 5173)
- Allowing tests to interact with the full application stack

## Debugging Workflow

1. **Report Issue**: User reports a bug with specific steps
2. **Copilot Investigation**: Use Copilot agent mode with Playwright to reproduce the issue
3. **Code Analysis**: Copilot examines the codebase to find the root cause
4. **Fix Implementation**: Copilot proposes and implements a fix
5. **Validation**: Copilot uses Playwright to verify the fix works
6. **Review**: You review the changes and create a pull request

## Benefits

- **Automated Bug Reproduction**: No need to manually follow user steps
- **Real Browser Testing**: Tests run in actual browsers, not just unit tests
- **AI-Powered Debugging**: Copilot can understand complex user flows
- **Validation**: Automatic verification that fixes actually work
- **Documentation**: Tests serve as living documentation of how the app works

## Troubleshooting

### Node.js Version Issues

If you encounter Node.js compatibility issues, the current setup uses a simplified configuration that should work with Node.js 18+.

### Port Conflicts

The configuration reuses existing servers when possible. If you have port conflicts, stop existing services first:

```bash
npm run cleanup-ports
```

### Browser Dependencies

If browsers don't work properly, you may need to install system dependencies (though this may require Node.js 20+):

```bash
sudo npx playwright install-deps
```

## Next Steps

1. Start the MCP server in VS Code
2. Try using Copilot agent mode with Playwright prompts
3. Add more specific tests for your application features
4. Integrate Playwright tests into your CI/CD pipeline

For more information, see the [GitHub Blog post on debugging with Playwright MCP](https://github.blog/ai-and-ml/github-copilot/how-to-debug-a-web-app-with-playwright-mcp-and-github-copilot/).
