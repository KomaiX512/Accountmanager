import express from 'express';
import AWS from 'aws-sdk';
import cors from 'cors';
import axios from 'axios';
import fetch from 'node-fetch';
import fs from 'fs';
import { promisify } from 'util';
import { pipeline } from 'stream';
import path from 'path';
import jpeg from 'jpeg-js';

const app = express();
const port = 3002;

console.log('Setting up server with proxy endpoints...');

// Configure AWS SDK
AWS.config.update({
  httpOptions: {
    connectTimeout: 5000,
    timeout: 10000
  },
  maxRetries: 3,
  retryDelayOptions: { base: 300 }
});

const s3Client = new AWS.S3({
  endpoint: 'https://9069781eea9a108d41848d73443b3a87.r2.cloudflarestorage.com',
  accessKeyId: 'b94be077bc48dcc2aec3e4331233327e',
  secretAccessKey: '791d5eeddcd8ed5bf3f41bfaebbd37e58af7dcb12275b1422747605d7dc75bc4',
  s3ForcePathStyle: true,
  signatureVersion: 'v4'
});

// Set up CORS completely permissively (no restrictions)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  next();
});

// Use cors middleware with widest possible settings
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: '*',
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} ${JSON.stringify(req.body)}`);
  // Track response completion
  res.on('finish', () => {
    console.log(`[${new Date().toISOString()}] Completed ${res.statusCode} for ${req.method} ${req.url}`);
  });
  // Track response errors
  res.on('error', (error) => {
    console.error(`[${new Date().toISOString()}] Response error for ${req.method} ${req.url}:`, error);
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Add an explicit OPTIONS handler for RAG endpoints
app.options('/rag-discussion/:username', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  res.status(204).send();
});

app.options('/rag-post/:username', (req, res) => {
  // Set CORS headers specifically for this endpoint
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400'); // 24 hours
  res.status(204).end();
});

app.options('/rag-conversations/:username', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  res.status(204).send();
});

// Stable Horde API configuration
const AI_HORDE_CONFIG = {
  api_key: process.env.AI_HORDE_API_KEY || "VxVGZGSL20PDRbi3mW2D5Q",
  base_url: "https://stablehorde.net/api/v2"
};

// RAG server proxy endpoint for Discussion Mode
app.post('/rag-discussion/:username', async (req, res) => {
  console.log(`[PROXY] Received discussion request for user ${req.params.username}`);
  const { username } = req.params;
  const { query, previousMessages } = req.body;
  
  if (!username || !query) {
    console.log(`[PROXY] Invalid request: missing username or query`);
    return res.status(400).json({ 
      error: 'Invalid request',
      details: 'Username and query are required'
    });
  }
  
  let retries = 0;
  const maxRetries = 2;
  
  const attemptRequest = async () => {
    try {
      console.log(`[${new Date().toISOString()}] Forwarding discussion request to RAG server for ${username} (attempt ${retries + 1}/${maxRetries + 1})`);
      
      const response = await axios.post('http://localhost:3001/api/discussion', {
        username,
        query,
        previousMessages: previousMessages || []
      }, {
        timeout: 30000 // 30 seconds timeout
      });
      
      console.log(`[PROXY] Successfully received response from RAG server`);
      return response.data;
    } catch (error) {
      if (retries < maxRetries) {
        retries++;
        console.log(`[PROXY] Retrying request (${retries}/${maxRetries})...`);
        return await attemptRequest();
      }
      throw error;
    }
  };
  
  try {
    const data = await attemptRequest();
    res.json(data);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] RAG discussion proxy error:`, error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error(`[${new Date().toISOString()}] Connection refused to RAG server. Check if it's running.`);
      res.status(503).json({ 
        error: 'RAG server unavailable',
        details: 'The RAG server is not accepting connections. Please try again later.'
      });
    } else if (error.response) {
      // Forward the error from RAG server
      console.log(`[PROXY] Forwarding RAG server error: ${error.response.status}`);
      res.status(error.response.status).json(error.response.data);
    } else {
      console.log(`[PROXY] Internal server error: ${error.message}`);
      res.status(500).json({ 
        error: 'Failed to connect to RAG server',
        details: error.message
      });
    }
  }
});

// RAG server proxy endpoint for Post Generation with image
app.post('/rag-post/:username', async (req, res) => {
  const { username } = req.params;
  const { query } = req.body;
  
  if (!username || !query) {
    return res.status(400).json({ error: 'Username and query are required' });
  }
  
  console.log(`[${new Date().toISOString()}] [POST MODE] Starting post generation pipeline for ${username}`);
  
  try {
    // Step 1: Generate post structure from RAG
    console.log(`[${new Date().toISOString()}] [POST MODE] Step 1: Generating post structure from RAG server`);
    
    let postStructure;
    
    try {
      // Generate post structure from RAG server
      const ragResponse = await axios.post(`http://localhost:3001/generate_post`, {
        username,
        query
      }, { timeout: 20000 });
      
      console.log(`[${new Date().toISOString()}] [POST MODE] RAG response received:`, JSON.stringify(ragResponse.data, null, 2).substring(0, 200) + '...');
      
      // Extract the post structure from the response
      if (ragResponse.data && ragResponse.data.response) {
        postStructure = ragResponse.data.response;
        
        // Ensure hashtags are in array format
        if (typeof postStructure.hashtags === 'string') {
          postStructure.hashtags = postStructure.hashtags.split(/\s+/).filter(tag => tag.startsWith('#'));
        }
      } else {
        throw new Error('Invalid response format from RAG server');
      }
      
      console.log(`[${new Date().toISOString()}] [POST MODE] Final post structure:`, JSON.stringify(postStructure, null, 2));
      console.log(`[${new Date().toISOString()}] [POST MODE] Post structure generated successfully`);
      
      // Step 2: Generate image based on the post content
      console.log(`[${new Date().toISOString()}] [POST MODE] Step 2: Generating image from prompt`);
      
      // Clean up and enhance the image prompt if needed
      let imagePrompt = postStructure.image_prompt;
      
      if (!imagePrompt || imagePrompt.length < 50 || imagePrompt.startsWith('/')) {
        // Create a better prompt based on the caption and hashtags
        const caption = postStructure.caption;
        const hashtags = postStructure.hashtags || [];
        
        // Extract key elements from the caption
        const extractedTerms = caption.match(/(?:lipstick|makeup|beauty|color|shade|summer|vibrant|glow|product)/gi) || [];
        const uniqueTerms = [...new Set(extractedTerms)].join(', ');
        
        imagePrompt = `Professional product photography of makeup cosmetics featuring ${uniqueTerms}. 
          Beautiful studio lighting, high-resolution, commercial quality photography. 
          Clean white background, professional shadows, vibrant colors, hyper-detailed product shot.`;
      }
      
      // Generate the image using real API
      let imageUrl;
      try {
        imageUrl = await generateImage(imagePrompt);
        console.log(`[${new Date().toISOString()}] [POST MODE] Successfully generated image with URL: ${imageUrl}`);
      } catch (imageGenError) {
        console.error(`[${new Date().toISOString()}] [POST MODE] Image generation failed: ${imageGenError.message}`);
        return res.status(500).json({
          error: 'Image generation failed',
          details: imageGenError.message
        });
      }
      
      // Step 3: Save the post data and image
      console.log(`[${new Date().toISOString()}] [POST MODE] Step 3: Saving post data and image to storage`);
      
      // Extract platform from request, default to instagram
      const platform = req.body.platform || req.query.platform || 'instagram';
      
      // Generate timestamp for unique filename
      const timestamp = Date.now();
      
      // Create directories if they don't exist using new schema: ready_post/<platform>/<username>
      const outputDir = `ready_post/${platform}/${username}`;
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Define output paths WITH CONSISTENT NAMING CONVENTION
      // Using the same timestamp for both files
      const imageFileName = `image_${timestamp}.jpg`;
      const jsonFileName = `ready_post_${timestamp}.json`;
      const imagePath = `${outputDir}/${imageFileName}`;
      const jsonPath = `${outputDir}/${jsonFileName}`;
      
      // Download and save the image
      let savedImagePath;
      try {
        savedImagePath = await downloadImage(imageUrl, imagePath);
        console.log(`[${new Date().toISOString()}] [POST MODE] Image downloaded and saved to ${savedImagePath}`);
      } catch (downloadError) {
        console.error(`[${new Date().toISOString()}] [POST MODE] Image download failed: ${downloadError.message}`);
        return res.status(500).json({
          error: 'Image download failed',
          details: downloadError.message
        });
      }
      
      // Save the post data with the image reference
      const postData = {
        post: {
          ...postStructure,
          image_prompt: imagePrompt
        },
        timestamp,
        image_path: savedImagePath,
        image_url: `http://localhost:3002/images/${username}/${imageFileName}`,
        r2_image_url: `http://localhost:3002/r2-images/${username}/${imageFileName}`,
        generated_at: new Date().toISOString(),
        queryUsed: query,
        status: 'new' // Set initial status to 'new'
      };
      
      fs.writeFileSync(jsonPath, JSON.stringify(postData, null, 2));
      console.log(`[${new Date().toISOString()}] [POST MODE] Post data saved to ${jsonPath}`);
      
      // For R2 storage, upload both files
      try {
        // Upload JSON
        const jsonUploadParams = {
          Bucket: 'tasks',
          Key: `${outputDir}/${jsonFileName}`,
          Body: JSON.stringify(postData, null, 2),
          ContentType: 'application/json'
        };

        console.log(`[${new Date().toISOString()}] [POST MODE] Starting R2 upload for: ${jsonUploadParams.Key} and ${outputDir}/${imageFileName}`);
        
        // Add detailed information about the objects being uploaded
        console.log(`[${new Date().toISOString()}] [POST MODE] JSON upload params:`, JSON.stringify({
          Bucket: jsonUploadParams.Bucket,
          Key: jsonUploadParams.Key,
          ContentType: jsonUploadParams.ContentType,
          ContentLength: JSON.stringify(postData, null, 2).length
        }));
        
        // Upload JSON to R2
        await s3Client.putObject(jsonUploadParams).promise();
        console.log(`[${new Date().toISOString()}] [POST MODE] JSON uploaded to R2: ${jsonUploadParams.Key} - SUCCESS`);
        
        // Upload Image to R2
        if (fs.existsSync(imagePath)) {
          const imageStream = fs.createReadStream(imagePath);
          const imageUploadParams = {
            Bucket: 'tasks',
            Key: `${outputDir}/${imageFileName}`,
            Body: imageStream,
            ContentType: 'image/jpeg'
          };
          
          console.log(`[${new Date().toISOString()}] [POST MODE] Image upload params:`, JSON.stringify({
            Bucket: imageUploadParams.Bucket,
            Key: imageUploadParams.Key,
            ContentType: imageUploadParams.ContentType
          }));
          
          await s3Client.putObject(imageUploadParams).promise();
          console.log(`[${new Date().toISOString()}] [POST MODE] Image uploaded to R2: ${imageUploadParams.Key} - SUCCESS`);
        } else {
          throw new Error(`Image file not found at path: ${imagePath}`);
        }
      } catch (uploadError) {
        console.error(`[${new Date().toISOString()}] [POST MODE] R2 upload error: ${uploadError.message}`);
        console.error(`[${new Date().toISOString()}] [POST MODE] Error stack:`, uploadError.stack);
        // Continue even if R2 upload fails - we have the local files
      }
      
      console.log(`[${new Date().toISOString()}] [POST MODE] Post generation pipeline completed successfully`);
      
      // Return the success response with post data
      return res.status(200).json({
        message: 'Post generated successfully',
        post: postData
      });
      
    } catch (error) {
      // Log the specific error
      console.error(`[${new Date().toISOString()}] [POST MODE] Post generation error: ${error.message}`);
      
      // Send error response
      return res.status(500).json({
        error: `Failed to generate post: ${error.message}`
      });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [POST MODE] Unexpected error: ${error.message}`);
    return res.status(500).json({ error: 'An unexpected error occurred' });
  }
});

// RAG server proxy endpoint for Conversation History
app.get('/rag-conversations/:username', async (req, res) => {
  const { username } = req.params;
  
  if (!username) {
    return res.status(400).json({ 
      error: 'Invalid request',
      details: 'Username is required'
    });
  }
  
  try {
    console.log(`[${new Date().toISOString()}] Fetching conversation history from RAG server for ${username}`);
    
    const response = await axios.get(`http://localhost:3001/api/conversations/${username}`, {
      timeout: 5000 // 5 seconds timeout
    });
    
    res.json(response.data);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] RAG conversation history proxy error:`, error.message);
    
    if (error.response) {
      // Forward the error from RAG server
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ 
        error: 'Failed to connect to RAG server',
        details: error.message
      });
    }
  }
});

// RAG server proxy endpoint for Saving Conversations
app.post('/rag-conversations/:username', async (req, res) => {
  const { username } = req.params;
  const { messages } = req.body;
  
  if (!username || !Array.isArray(messages)) {
    return res.status(400).json({ 
      error: 'Invalid request',
      details: 'Username and messages array are required'
    });
  }
  
  try {
    console.log(`[${new Date().toISOString()}] Saving conversation to RAG server for ${username}`);
    
    const response = await axios.post(`http://localhost:3001/api/conversations/${username}`, {
      messages
    }, {
      timeout: 5000 // 5 seconds timeout
    });
    
    res.json(response.data);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] RAG save conversation proxy error:`, error.message);
    
    if (error.response) {
      // Forward the error from RAG server
      res.status(error.response.status).json(error.response.data);
    } else {
      res.status(500).json({ 
        error: 'Failed to connect to RAG server',
        details: error.message
      });
    }
  }
});

// Scrape endpoint with guaranteed hierarchical storage
app.post('/scrape', async (req, res) => {
  try {
    const { parent, children } = req.body;
    
    // Validate input structure
    if (!parent?.username || !Array.isArray(children)) {
      return res.status(400).json({ 
        error: 'Invalid request structure',
        details: 'Request must contain parent.username and children array'
      });
    }

    console.log('Processing hierarchical data for:', {
      parent: parent.username,
      children: children.map(c => c.username)
    });

    // Create the hierarchical entry
    const timestamp = new Date().toISOString();
    const hierarchicalEntry = {
      username: parent.username.trim(),
      timestamp,
      status: 'pending',
      children: children.map(child => ({
        username: child.username.trim(),
        timestamp,
        status: 'pending'
      }))
    };

    // Get existing data or initialize new array
    let existingData = await getExistingData();
    
    // Add new hierarchical entry
    existingData.push(hierarchicalEntry);

    // Save to R2
    await saveToR2(existingData);
    
    res.json({
      success: true,
      message: 'Data stored in hierarchical format',
      parent: hierarchicalEntry.username,
      childrenCount: hierarchicalEntry.children.length
    });

  } catch (error) {
    console.error('Scrape endpoint error:', error);
    handleErrorResponse(res, error);
  }
});

// New endpoint for retrieving competitor data
app.get('/retrieve/:accountHolder/:competitor', async (req, res) => {
  const { accountHolder, competitor } = req.params;
  const key = `competitor_analysis/${accountHolder}/${competitor}/file.json`; // Adjust the filename as needed

  try {
    // Use v2 method instead of v3 send() method
    const data = await s3Client.getObject({
      Bucket: 'tasks',
      Key: key
    }).promise();
    
    // Parse the response body and send it to the client
    const responseData = JSON.parse(data.Body.toString('utf-8'));
    return res.json(responseData);
  } catch (error) {
    console.error('Retrieve endpoint error:', error);
    res.status(500).json({ error: 'Error retrieving data' });
  }
});

// Helper function to get existing data
async function getExistingData() {
  try {
    // Use v2 method instead of v3 send() method
    const data = await s3Client.getObject({
      Bucket: 'tasks',
      Key: 'Usernames/instagram.json'
    }).promise();
    
    const parsedData = JSON.parse(data.Body.toString('utf-8'));
    
    // Return parsed data or empty array
    return Array.isArray(parsedData) ? parsedData : [];
  } catch (error) {
    console.error('Error getting existing data:', error);
    return [];
  }
}

// Helper function to save data to R2
async function saveToR2(data) {
  // Use v2 method instead of v3 send() method
  await s3Client.putObject({
    Bucket: 'tasks',
    Key: 'Usernames/instagram.json',
    Body: JSON.stringify(data, null, 2),
    ContentType: 'application/json'
  }).promise();
  
  console.log('Data saved to R2 successfully');
}

// Helper function to stream a stream to a string
function streamToString(stream) {
  return new Promise((resolve, reject) => {
    if (typeof stream === 'string') {
      return resolve(stream);
    }
    
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    stream.on('error', reject);
  });
}

// Error handler
function handleErrorResponse(res, error) {
  const statusCode = error.name === 'TimeoutError' ? 504 : 500;
  res.status(statusCode).json({
    error: error.name || 'Internal server error',
    message: error.message || 'An unexpected error occurred'
  });
}

// Generate image from prompt using Stable Horde
async function generateImage(prompt) {
  console.log(`[${new Date().toISOString()}] [IMAGE GEN] Starting image generation for prompt: ${prompt.substring(0, 50)}...`);
  
  // Validate and enhance the prompt
  let enhancedPrompt = prompt;
  if (!prompt || prompt.length < 20 || prompt.startsWith('/') || prompt.includes('**')) {
    console.log(`[${new Date().toISOString()}] [IMAGE GEN] Invalid or short prompt, using enhanced product photography prompt`);
    enhancedPrompt = `Professional cosmetic product photography of colorful lipstick shades, summer themed, 
      on clean white background with soft shadows, cosmetic products, makeup, beauty photography, professional studio lighting, 
      high-end commercial photography, 8k resolution, advertisement quality, product showcase, vibrant colors, hyper-detailed, 
      ultra-realistic, professional beauty product photography`;
  }
  
  // Set a timeout for the API request
  const apiTimeout = 40000; // 40 seconds timeout for image generation
  
  try {
    // Create the payload for the Stable Horde API
    const payload = {
      prompt: enhancedPrompt,
      params: {
        width: 512,
        height: 512,
        steps: 50,
        cfg_scale: 7.5
      }
    };

    console.log(`[${new Date().toISOString()}] [IMAGE GEN] Sending request to Stable Horde API`);
    
    // Step 1: Submit the generation request to get a job ID
    const generationResponse = await axios.post(
      'https://stablehorde.net/api/v2/generate/async', 
      payload, 
      {
        headers: { 
          'Content-Type': 'application/json',
          'apikey': AI_HORDE_CONFIG.api_key
        },
        timeout: 15000 // 15 second timeout for initial request
      }
    );
    
    if (!generationResponse.data || !generationResponse.data.id) {
      throw new Error('No job ID received from Stable Horde API');
    }
    
    const jobId = generationResponse.data.id;
    console.log(`[${new Date().toISOString()}] [IMAGE GEN] Received job ID: ${jobId}`);
    
    // Step 2: Poll for job completion
    let imageUrl = null;
    let attempts = 0;
    const maxAttempts = 20; // Maximum poll attempts
    const pollInterval = 3000; // 3 seconds between polls
    
    while (!imageUrl && attempts < maxAttempts) {
      attempts++;
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      
      console.log(`[${new Date().toISOString()}] [IMAGE GEN] Checking job status (attempt ${attempts}/${maxAttempts})`);
      
      // Check if the job is done
      const checkResponse = await axios.get(
        `https://stablehorde.net/api/v2/generate/check/${jobId}`,
        {
          headers: { 'apikey': AI_HORDE_CONFIG.api_key },
          timeout: 5000
        }
      );
      
      if (checkResponse.data && checkResponse.data.done) {
        console.log(`[${new Date().toISOString()}] [IMAGE GEN] Job complete, retrieving result`);
        
        // Get the generation result
        const resultResponse = await axios.get(
          `https://stablehorde.net/api/v2/generate/status/${jobId}`,
          {
            headers: { 'apikey': AI_HORDE_CONFIG.api_key },
            timeout: 5000
          }
        );
        
        if (resultResponse.data && 
            resultResponse.data.generations && 
            resultResponse.data.generations.length > 0 &&
            resultResponse.data.generations[0].img) {
          
          imageUrl = resultResponse.data.generations[0].img;
          console.log(`[${new Date().toISOString()}] [IMAGE GEN] Successfully retrieved image URL`);
        }
      } else {
        console.log(`[${new Date().toISOString()}] [IMAGE GEN] Job still processing (attempt ${attempts}/${maxAttempts})`);
      }
    }
    
    if (!imageUrl) {
      throw new Error(`Failed to generate image after ${maxAttempts} attempts`);
    }
    
    return imageUrl;
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [IMAGE GEN] API error: ${error.message || 'Unknown error'}`);
    
    if (error.response) {
      console.error(`[${new Date().toISOString()}] [IMAGE GEN] API error details: ${error.response.status} ${error.response.statusText}`);
      console.error(`[${new Date().toISOString()}] [IMAGE GEN] API error response: ${JSON.stringify(error.response.data)}`);
    }
    
    throw new Error(`Image generation failed: ${error.message}`);
  }
}

// Download an image from a URL to a local file
async function downloadImage(imageUrl, outputPath) {
  try {
    console.log(`[${new Date().toISOString()}] [IMAGE DOWNLOAD] Downloading image from: ${imageUrl}...`);
    
    // Create directory if it doesn't exist
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const response = await axios({
      method: 'GET',
      url: imageUrl,
      responseType: 'arraybuffer',
      timeout: 15000 // 15 seconds timeout
    });
    
    // Check if the response is valid
    if (!response || response.status !== 200) {
      throw new Error(`Failed to download image: ${response?.status} ${response?.statusText}`);
    }
    
    // Write the image data to file directly
    fs.writeFileSync(outputPath, Buffer.from(response.data));
    console.log(`[${new Date().toISOString()}] [IMAGE DOWNLOAD] Image downloaded successfully to ${outputPath}`);
    return outputPath;
    
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [IMAGE DOWNLOAD] Error downloading image: ${error.message}`);
    throw new Error(`Image download failed: ${error.message}`);
  }
}

// Serve static images
app.use('/images', express.static('ready_post'));

// Add a proxy endpoint for R2 images to avoid CORS issues
app.get('/r2-images/:username/:filename', async (req, res) => {
  try {
    const { username, filename } = req.params;
    const platform = req.query.platform || 'instagram'; // Default to instagram for backward compatibility
    const key = `ready_post/${platform}/${username}/${filename}`;
    
    console.log(`[${new Date().toISOString()}] [IMAGE PROXY] Requesting image from R2: ${key}`);
    
    try {
      // Get the image from R2
      const data = await s3Client.getObject({
        Bucket: 'tasks',
        Key: key
      }).promise();
      
      // Set appropriate headers
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      
      // Send the image data
      res.send(data.Body);
      console.log(`[${new Date().toISOString()}] [IMAGE PROXY] Successfully served image: ${key}`);
    } catch (r2Error) {
      console.error(`[${new Date().toISOString()}] [IMAGE PROXY] R2 error for ${key}: ${r2Error.message}`);
      
      // If the image doesn't exist in R2, try to serve it from local filesystem as backup
      if (r2Error.code === 'NoSuchKey') {
        const localPath = path.join(process.cwd(), 'ready_post', platform, req.params.username, req.params.filename);
        
        if (fs.existsSync(localPath)) {
          console.log(`[${new Date().toISOString()}] [IMAGE PROXY] Serving local image: ${localPath}`);
          return res.sendFile(localPath);
        } else {
          console.error(`[${new Date().toISOString()}] [IMAGE PROXY] Image not found in R2 or locally: ${key}`);
          return res.status(404).json({ error: 'Image not found' });
        }
      } else {
        // For other R2 errors, return an error
        console.error(`[${new Date().toISOString()}] [IMAGE PROXY] R2 error: ${r2Error.code} - ${r2Error.message}`);
        return res.status(500).json({ error: 'Error retrieving image from storage' });
      }
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] [IMAGE PROXY] Unexpected error: ${error.message}`);
    return res.status(500).json({ error: 'Unexpected error retrieving image' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Ready to receive hierarchical data at POST /scrape');
});
