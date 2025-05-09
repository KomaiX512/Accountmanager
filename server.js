import express from 'express';
import AWS from 'aws-sdk';
import cors from 'cors';
import axios from 'axios';

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

const s3 = new AWS.S3({
  endpoint: 'https://9069781eea9a108d41848d73443b3a87.r2.cloudflarestorage.com',
  accessKeyId: 'b94be077bc48dcc2aec3e4331233327e',
  secretAccessKey: '791d5eeddcd8ed5bf3f41bfaebbd37e58af7dcb12275b1422747605d7dc75bc4',
  s3ForcePathStyle: true,
  signatureVersion: 'v4'
});

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: '*',
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
}));
app.use(express.json());

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
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  res.status(204).send();
});

app.options('/rag-conversations/:username', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', '*');
  res.status(204).send();
});

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

// RAG server proxy endpoint for Post Generation
app.post('/rag-post/:username', async (req, res) => {
  const { username } = req.params;
  const { query } = req.body;
  
  if (!username || !query) {
    return res.status(400).json({ 
      error: 'Invalid request',
      details: 'Username and query are required'
    });
  }
  
  let retries = 0;
  const maxRetries = 2;
  
  const attemptRequest = async () => {
    try {
      console.log(`[${new Date().toISOString()}] Forwarding post generation request to RAG server for ${username} (attempt ${retries + 1}/${maxRetries + 1})`);
      
      const response = await axios.post('http://localhost:3001/api/post-generator', {
        username,
        query
      }, {
        timeout: 30000 // 30 seconds timeout
      });
      
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
    console.error(`[${new Date().toISOString()}] RAG post generation proxy error:`, error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error(`[${new Date().toISOString()}] Connection refused to RAG server. Check if it's running.`);
      res.status(503).json({ 
        error: 'RAG server unavailable',
        details: 'The RAG server is not accepting connections. Please try again later.'
      });
    } else if (error.response) {
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
    const data = await s3.getObject({
      Bucket: 'tasks',
      Key: key
    }).promise();

    const parsedData = JSON.parse(data.Body.toString());
    res.json(parsedData);
  } catch (error) {
    console.error('Retrieve endpoint error:', error);
    res.status(500).json({ error: 'Error retrieving data' });
  }
});

// Helper function to get existing data
async function getExistingData() {
  try {
    const data = await s3.getObject({
      Bucket: 'tasks',
      Key: 'Usernames/instagram.json'
    }).promise();
    
    const parsedData = JSON.parse(data.Body.toString());
    
    // Ensure we're working with an array
    return Array.isArray(parsedData) ? parsedData : [];
  } catch (error) {
    if (error.code === 'NoSuchKey') {
      return []; // File doesn't exist yet
    }
    throw error;
  }
}

// Helper function to save data to R2
async function saveToR2(data) {
  await s3.putObject({
    Bucket: 'tasks',
    Key: 'Usernames/instagram.json',
    Body: JSON.stringify(data, null, 2),
    ContentType: 'application/json'
  }).promise();
}

// Error handler
function handleErrorResponse(res, error) {
  const statusCode = error.name === 'TimeoutError' ? 504 : 500;
  res.status(statusCode).json({
    error: error.name || 'Internal server error',
    message: error.message || 'An unexpected error occurred'
  });
}

app.listen(port, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Ready to receive hierarchical data at POST /scrape');
});
