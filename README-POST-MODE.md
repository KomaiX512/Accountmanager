# Post Mode - Automated Instagram Content Generator

This module allows for the automated generation of professional Instagram posts complete with:
- Engaging captions
- Relevant hashtags
- Clear call-to-action
- AI-generated images

## Overview

The Post Mode feature uses an AI-powered RAG (Retrieval Augmented Generation) system to create customized Instagram content based on user input. The system handles the entire pipeline from content creation to image generation and storage.

## Architecture

The Post Mode feature consists of three main components:

1. **RAG Server** (`rag-server.js`): Handles the generation of post content (captions, hashtags, CTAs, image prompts) using AI models
2. **Proxy Server** (`server.js`): Manages the API endpoints, image generation, and storage of the final post data
3. **Client** (`src/services/RagService.ts`): Provides TypeScript interfaces and methods for interacting with the Post Mode API

## How it Works

1. The user provides a query like "Create a post about our new lipstick collection for summer"
2. The query is sent to the RAG server which generates:
   - A catchy, emoji-rich caption
   - Relevant hashtags
   - Call-to-action text
   - Detailed image prompt
3. The proxy server processes the RAG response and generates an image based on the prompt
4. The final post data (JSON) and image are saved in the `ready_post/<username>/` directory
5. The system returns a response with all post data including URLs to access the saved image

## File Structure

- Generated posts are saved in the `ready_post/<username>/` directory
- Each post consists of two files:
  - `ready_post_<timestamp>.json`: Contains all post data (caption, hashtags, CTA, image prompt, etc.)
  - `image_<timestamp>.jpg`: The generated image for the post
- Images can be accessed via: `http://localhost:3002/images/<username>/image_<timestamp>.jpg`

## API Endpoints

### Generate Post

```
POST /rag-post/:username
```

**Request Body:**
```json
{
  "query": "Create a post about [topic]"
}
```

**Response:**
```json
{
  "message": "Post generated successfully",
  "post": {
    "caption": "...",
    "hashtags": ["#tag1", "#tag2", ...],
    "call_to_action": "...",
    "image_prompt": "...",
    "timestamp": 1234567890123,
    "image_path": "ready_post/username/image_1234567890123.jpg",
    "generated_at": "2025-05-09T04:50:22.067Z",
    "image_url": "http://localhost:3002/images/username/image_1234567890123.jpg"
  }
}
```

## Fallback Mechanisms

The system includes several fallback mechanisms to ensure reliability:

1. **AI Model Fallback**: If the AI model fails to generate a proper response, the system uses a fallback generator based on the query keywords and product types
2. **Image Generation Fallback**: If the primary image generator fails, the system tries alternative methods including using a stock image or generating a simple image
3. **Error Handling**: Comprehensive error handling ensures the system can recover gracefully from various failure scenarios

## Types and Interfaces

The primary interfaces for Post Mode are defined in `src/services/RagService.ts`:

```typescript
interface PostData {
  caption: string;
  hashtags: string[];
  call_to_action: string;
  image_prompt: string;
  timestamp?: number;
  image_path?: string;
  generated_at?: string;
  image_url?: string;
  queryUsed?: string;
  status?: 'ready' | 'processing' | 'error';
}

interface PostGenerationResponse {
  success: boolean;
  message: string;
  post?: PostData;
  error?: string;
  details?: string;
}
```

## Usage Example

```typescript
import RagService from '../services/RagService';

async function generatePost() {
  const username = 'maccosmetics';
  const query = 'Create a post about our new foundation line for all skin tones';
  
  const response = await RagService.sendPostQuery(username, query);
  
  if (response.success && response.post) {
    console.log('Post generated:', response.post);
    // Use the generated post data
  } else {
    console.error('Failed to generate post:', response.error);
  }
}
```

## Accessing Generated Content

Generated posts and images can be accessed through:

1. **API**: `http://localhost:3002/images/<username>/image_<timestamp>.jpg`
2. **File System**: 
   - JSON: `ready_post/<username>/ready_post_<timestamp>.json`
   - Image: `ready_post/<username>/image_<timestamp>.jpg`

## Troubleshooting

If you encounter issues with the Post Mode:

1. Check that all servers are running:
   - RAG Server (port 3001)
   - Proxy Server (port 3002)
   - Main App Server (port 3000)
2. Verify the `ready_post` directory exists and has proper permissions
3. Check server logs for specific error messages
4. Ensure AI API keys are valid and properly configured 