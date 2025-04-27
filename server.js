import express from 'express';
import AWS from 'aws-sdk';
import cors from 'cors';

const app = express();
const port = 3000;

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
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
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

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Ready to receive hierarchical data at POST /scrape');
});
