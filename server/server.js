const express = require('express');
const { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const cors = require('cors');
const app = express();
const port = 3000;

const s3Client = new S3Client({
  endpoint: 'https://9069781eea9a108d41848d73443b3a87.r2.cloudflarestorage.com',
  region: 'auto',
  credentials: {
    accessKeyId: 'b94be077bc48dcc2aec3e4331233327e',
    secretAccessKey: '791d5eeddcd8ed5bf3f41bfaebbd37e58af7dcb12275b1422747605d7dc75bc4',
  },
  maxAttempt: 3,
  httpOptions: {
    connectTimeout: 50000,
    timeout: 100000,
  },
});

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  exposedHeaders: ['Content-Type'],
}));
app.use(express.json());

app.options('*', cors());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

const cache = new Map();
const cacheTimestamps = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const THROTTLE_INTERVAL = 5 * 60 * 1000;

const sseClients = new Map();
let currentUsername = null;

const MODULE_PREFIXES = [
  'competitor_analysis',
  'recommendations',
  'engagement_strategies',
  'ready_post',
  'queries',
  'rules',
  'feedbacks',
  'NewForYou',
  'ProfileInfo',
];

async function initializeCurrentUsername() {
  try {
    const existingData = await getExistingData();
    if (existingData.length > 0) {
      const latestEntry = existingData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
      currentUsername = latestEntry.username;
      console.log(`Initialized currentUsername to ${currentUsername} on server startup`);
    }
  } catch (error) {
    console.error('Error initializing currentUsername:', error);
  }
}

initializeCurrentUsername();

app.post('/webhook/r2', async (req, res) => {
  try {
    const { event, key } = req.body;
    console.log(`Received R2 event: ${event} for key: ${key}`);

    if (event === 'ObjectCreated:Put' || event === 'ObjectCreated:Post') {
      const match = key.match(/^(.*?)\/(.*?)\/(.*)$/);
      if (match) {
        const [, prefix, username] = match;
        const cacheKey = `${prefix}/${username}`;
        console.log(`Invalidating cache for ${cacheKey}`);
        cache.delete(cacheKey);

        const clients = sseClients.get(username) || [];
        for (const client of clients) {
          client.write(`data: ${JSON.stringify({ type: 'update', prefix: cacheKey })}\n\n`);
        }
      }
    }

    res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Error processing webhook', details: error.message });
  }
});

app.get('/events/:username', (req, res) => {
  const { username } = req.params;

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': 'http://localhost:5173',
    'Access-Control-Allow-Methods': 'GET',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'Content-Type',
  });

  if (!sseClients.has(username)) {
    sseClients.set(username, []);
  }
  const clients = sseClients.get(username);
  clients.push(res);

  console.log(`[${Date.now()}] SSE client connected for ${username}. Total clients: ${clients.length}`);

  res.write(`data: ${JSON.stringify({ type: 'connection', message: `Connected to events for ${username}` })}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(`data: ${JSON.stringify({ type: 'heartbeat' })}\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const updatedClients = sseClients.get(username).filter(client => client !== res);
    sseClients.set(username, updatedClients);
    console.log(`[${Date.now()}] SSE client disconnected for ${username}`);
    if (updatedClients.length === 0) {
      sseClients.delete(username);
    }
    res.end();
  });
});

async function fetchDataForModule(username, prefixTemplate) {
  if (!username) {
    console.error('No username provided, cannot fetch data');
    return [];
  }

  const prefix = prefixTemplate.replace('{username}', username);
  const now = Date.now();
  const lastFetch = cacheTimestamps.get(prefix) || 0;

  if (cache.has(prefix)) {
    console.log(`Cache hit for prefix: ${prefix}`);
    return cache.get(prefix);
  }

  if (now - lastFetch < THROTTLE_INTERVAL) {
    console.log(`Throttled fetch for prefix: ${prefix}`);
    return cache.has(prefix) ? cache.get(prefix) : [];
  }

  try {
    console.log(`Fetching data from R2 for prefix: ${prefix}`);
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: prefix,
    });
    const listResponse = await s3Client.send(listCommand);

    const files = listResponse.Contents || [];
    const data = await Promise.all(
      files.map(async (file) => {
        try {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: file.Key,
          });
          const data = await s3Client.send(getCommand);
          const body = await streamToString(data.Body);

          if (!body || body.trim() === '') {
            console.warn(`Empty file detected at ${file.Key}, skipping...`);
            return null;
          }

          const parsedData = JSON.parse(body);
          return { key: file.Key, data: parsedData };
        } catch (error) {
          console.error(`Failed to process file ${file.Key}:`, error.message);
          return null;
        }
      })
    );

    const validData = data.filter(item => item !== null);
    cache.set(prefix, validData);
    cacheTimestamps.set(prefix, now);
    return validData;
  } catch (error) {
    console.error(`Error fetching data for prefix ${prefix}:`, error);
    return [];
  }
}

app.get('/profile-info/:username', async (req, res) => {
  const { username } = req.params;
  const key = `ProfileInfo/${username}.json`;
  const prefix = `ProfileInfo/${username}`;

  try {
    let data;
    if (cache.has(prefix)) {
      console.log(`Cache hit for profile info: ${prefix}`);
      const cachedData = cache.get(prefix);
      data = cachedData.find(item => item.key === key)?.data;
    }

    if (!data) {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      const response = await s3Client.send(getCommand);
      const body = await streamToString(response.Body);

      if (!body || body.trim() === '') {
        console.warn(`Empty file detected at ${key}`);
        return res.status(404).json({ error: 'Profile info is empty' });
      }

      data = JSON.parse(body);
      cache.set(prefix, [{ key, data }]);
      cacheTimestamps.set(prefix, Date.now());
    }

    res.json(data);
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      console.log(`Profile info not found for ${key}`);
      return res.status(404).json({ error: 'Profile info not found' });
    }
    console.error(`Error fetching profile info for ${key}:`, error.message);
    res.status(500).json({ error: 'Error retrieving profile info', details: error.message });
  }
});

app.post('/save-account-info', async (req, res) => {
  try {
    const { username, accountType, postingStyle, competitors } = req.body;

    if (!username || !accountType || !postingStyle) {
      return res.status(400).json({ error: 'Username, account type, and posting style are required' });
    }

    const payload = {
      username,
      accountType,
      postingStyle,
      ...(competitors && { competitors }),
      timestamp: new Date().toISOString(),
    };

    const key = `AccountInfo/${username}/info.json`;
    console.log(`Saving account info to: ${key}`);
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(payload, null, 2),
      ContentType: 'application/json',
    });
    await s3Client.send(putCommand);

    const cacheKey = `AccountInfo/${username}`;
    cache.delete(cacheKey);

    res.json({ success: true, message: 'Account info saved successfully' });
  } catch (error) {
    console.error('Save account info error:', error);
    handleErrorResponse(res, error);
  }
});

app.post('/scrape', async (req, res) => {
  try {
    const { parent, children } = req.body;

    if (!parent?.username || !Array.isArray(children)) {
      return res.status(400).json({
        error: 'Invalid request structure',
        details: 'Request must contain parent.username and children array',
      });
    }

    const newUsername = parent.username.trim();
    console.log('Processing hierarchical data for:', {
      parent: newUsername,
      children: children.map(c => c.username),
    });

    if (currentUsername !== newUsername) {
      console.log(`Username changed from ${currentUsername || 'none'} to ${newUsername}, resetting caches...`);
      currentUsername = newUsername;

      MODULE_PREFIXES.forEach((prefixTemplate) => {
        const prefix = `${prefixTemplate}/${currentUsername}`;
        console.log(`Clearing cache for ${prefix}`);
        cache.delete(prefix);
      });

      const clients = sseClients.get(currentUsername) || [];
      for (const client of clients) {
        client.write(`data: ${JSON.stringify({ type: 'usernameChanged', username: currentUsername })}\n\n`);
      }
    }

    const timestamp = new Date().toISOString();
    const hierarchicalEntry = {
      username: newUsername,
      timestamp,
      status: 'pending',
      children: children.map(child => ({
        username: child.username.trim(),
        timestamp,
        status: 'pending',
      })),
    };

    let existingData = await getExistingData();
    existingData.push(hierarchicalEntry);
    await saveToR2(existingData);

    cache.delete('Usernames');

    res.json({
      success: true,
      message: 'Data stored in hierarchical format',
      parent: hierarchicalEntry.username,
      childrenCount: hierarchicalEntry.children.length,
    });
  } catch (error) {
    console.error('Scrape endpoint error:', error);
    handleErrorResponse(res, error);
  }
});

app.get('/retrieve/:accountHolder/:competitor', async (req, res) => {
  const { accountHolder, competitor } = req.params;

  try {
    const data = await fetchDataForModule(accountHolder, `competitor_analysis/{username}/${competitor}`);
    if (data.length === 0) {
      res.status(404).json({ error: 'No analysis files found' });
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error(`Retrieve endpoint error for ${accountHolder}/${competitor}:`, error);
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: 'Data not ready yet' });
    } else {
      res.status(500).json({ error: 'Error retrieving data', details: error.message });
    }
  }
});

app.get('/retrieve-strategies/:accountHolder', async (req, res) => {
  const { accountHolder } = req.params;

  try {
    const data = await fetchDataForModule(accountHolder, 'recommendations/{username}');
    if (data.length === 0) {
      res.status(404).json({ error: 'No recommendation files found' });
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error(`Retrieve strategies endpoint error for ${accountHolder}:`, error);
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: 'Data not ready yet' });
    } else {
      res.status(500).json({ error: 'Error retrieving data', details: error.message });
    }
  }
});

app.get('/retrieve-engagement-strategies/:accountHolder', async (req, res) => {
  const { accountHolder } = req.params;

  try {
    const data = await fetchDataForModule(accountHolder, 'engagement_strategies/{username}');
    if (data.length === 0) {
      res.status(404).json({ error: 'No engagement strategy files found' });
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error(`Retrieve engagement strategies endpoint error for ${accountHolder}:`, error);
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: 'Data not ready yet' });
    } else {
      res.status(500).json({ error: 'Error retrieving data', details: error.message });
    }
  }
});

app.get('/news-for-you/:accountHolder', async (req, res) => {
  const { accountHolder } = req.params;

  try {
    const data = await fetchDataForModule(accountHolder, 'NewForYou/{username}');
    if (data.length === 0) {
      res.status(404).json({ error: 'No news files found' });
    } else {
      res.json(data);
    }
  } catch (error) {
    console.error(`Retrieve news endpoint error for ${accountHolder}:`, error);
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: 'Data not ready yet' });
    } else {
      res.status(500).json({ error: 'Error retrieving data', details: error.message });
    }
  }
});

app.post('/save-query/:accountHolder', async (req, res) => {
  const { accountHolder } = req.params;
  const { query } = req.body;

  const prefix = `queries/${accountHolder}/`;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Query must be a non-empty string' });
  }

  try {
    let queryNumber = 1;
    if (cache.has(prefix)) {
      const cachedData = cache.get(prefix);
      const queryNumbers = cachedData
        .filter(obj => obj.key.match(/query_\d+\.json$/))
        .map(file => {
          const match = file.key.match(/query_(\d+)\.json$/);
          return match ? parseInt(match[1]) : 0;
        });
      queryNumber = queryNumbers.length ? Math.max(...queryNumbers) + 1 : 1;
    }

    const queryKey = `${prefix}query_${queryNumber}.json`;
    const queryData = {
      query: query.trim(),
      status: 'pending',
      timestamp: new Date().toISOString(),
    };
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: queryKey,
      Body: JSON.stringify(queryData, null, 2),
      ContentType: 'application/json',
    });
    await s3Client.send(putCommand);

    cache.delete(prefix);

    res.json({ success: true, message: 'Query saved successfully' });
  } catch (error) {
    console.error(`Save query error for ${prefix}:`, error);
    res.status(500).json({ error: 'Error saving query', details: error.message });
  }
});

app.get('/rules/:username', async (req, res) => {
  const { username } = req.params;

  const key = `rules/${username}/rules.json`;
  const prefix = `rules/${username}/`;

  try {
    let data;
    if (cache.has(prefix)) {
      console.log(`Cache hit for rules: ${prefix}`);
      const cachedData = cache.get(prefix);
      data = cachedData.find(item => item.key === key)?.data;
    }

    if (!data) {
      const getCommand = new GetObjectCommand({
        Bucket: 'tasks',
        Key: key,
      });
      const response = await s3Client.send(getCommand);
      const body = await streamToString(response.Body);

      if (!body || body.trim() === '') {
        throw new Error(`Empty file detected at ${key}`);
      }

      data = JSON.parse(body);
      cache.set(prefix, [{ key, data }]);
      cacheTimestamps.set(prefix, Date.now());
    }

    res.json(data);
  } catch (error) {
    console.error(`Error fetching rules for ${key}:`, error);
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: 'Rules not found' });
    } else {
      res.status(500).json({ error: 'Error retrieving rules', details: error.message });
    }
  }
});

app.post('/rules/:username', async (req, res) => {
  const { username } = req.params;
  const { rules } = req.body;

  const key = `rules/${username}/rules.json`;
  const prefix = `rules/${username}/`;

  if (!rules || typeof rules !== 'string') {
    return res.status(400).json({ error: 'Rules must be a non-empty string' });
  }

  try {
    const rulesData = {
      rules: rules.trim(),
      timestamp: new Date().toISOString(),
    };
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(rulesData, null, 2),
      ContentType: 'application/json',
    });
    await s3Client.send(putCommand);

    cache.delete(prefix);

    const clients = sseClients.get(username) || [];
    for (const client of clients) {
      client.write(`data: ${JSON.stringify({ type: 'update', prefix })}\n\n`);
    }

    res.json({ success: true, message: 'Rules saved successfully' });
  } catch (error) {
    console.error(`Save rules error for ${key}:`, error);
    res.status(500).json({ error: 'Error saving rules', details: error.message });
  }
});

app.get('/responses/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const data = await fetchDataForModule(username, 'queries/{username}');
    res.json(data);
  } catch (error) {
    console.error(`Retrieve responses error for ${username}:`, error);
    res.status(500).json({ error: 'Error retrieving responses', details: error.message });
  }
});

app.post('/responses/:username/:responseId', async (req, res) => {
  const { username, responseId } = req.params;

  const key = `queries/${username}/response_${responseId}.json`;
  const prefix = `queries/${username}/`;

  try {
    const getCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: key,
    });
    const data = await s3Client.send(getCommand);
    const body = await streamToString(data.Body);

    if (!body || body.trim() === '') {
      throw new Error(`Empty file detected at ${key}`);
    }

    const responseData = JSON.parse(body);
    responseData.status = 'processed';
    responseData.timestamp = new Date().toISOString();

    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(responseData, null, 2),
      ContentType: 'application/json',
    });
    await s3Client.send(putCommand);

    cache.delete(prefix);

    res.json({ success: true, message: 'Response status updated' });
  } catch (error) {
    console.error(`Update response error for ${key}:`, error);
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      res.status(404).json({ error: 'Response not found' });
    } else {
      res.status(500).json({ error: 'Error updating response', details: error.message });
    }
  }
});

app.get('/posts/:username', async (req, res) => {
  const { username } = req.params;

  try {
    const data = await fetchDataForModule(username, 'ready_post/{username}');
    console.log(`Fetched posts for ${username}:`, JSON.stringify(data, null, 2));

    const updatedData = await Promise.all(
      data.map(async (item) => {
        const postData = { ...item.data };
        if (postData.image) {
          try {
            const imageKey = postData.image.split('.com/')[1]?.split('?')[0];
            if (imageKey) {
              const getCommand = new GetObjectCommand({
                Bucket: 'stable-horde',
                Key: imageKey,
              });
              const signedUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });
              postData.image_url = signedUrl; // Ensure the field is renamed to image_url
              delete postData.image; // Remove the original image field
            } else {
              postData.image_url = null;
            }
          } catch (error) {
            console.error(`Error generating pre-signed URL for ${postData.image}:`, error);
            postData.image_url = null;
            delete postData.image;
          }
        } else {
          postData.image_url = postData.image_url || null;
        }
        return { key: item.key, data: postData };
      })
    );

    console.log(`Returning updated posts for ${username}:`, JSON.stringify(updatedData, null, 2));
    res.json(updatedData);
  } catch (error) {
    console.error(`Retrieve posts error for ${username}:`, error);
    res.status(500).json({ error: 'Error retrieving posts', details: error.message });
  }
});

app.post('/feedback/:username', async (req, res) => {
  const { username } = req.params;
  const { responseKey, feedback, type } = req.body;

  const prefix = `feedbacks/${username}/`;

  if (!responseKey || !feedback || typeof feedback !== 'string') {
    return res.status(400).json({ error: 'Response key and feedback must be provided' });
  }

  try {
    let feedbackNumber = 1;
    if (cache.has(prefix)) {
      const cachedData = cache.get(prefix);
      const feedbackNumbers = cachedData
        .filter(obj => obj.key.match(/feedback_\d+\.json$/))
        .map(file => {
          const match = file.key.match(/feedback_(\d+)\.json$/);
          return match ? parseInt(match[1]) : 0;
        });
      feedbackNumber = feedbackNumbers.length ? Math.max(...feedbackNumbers) + 1 : 1;
    }

    const feedbackKey = `${prefix}feedback_${feedbackNumber}.json`;
    const feedbackData = {
      responseKey,
      feedback: feedback.trim(),
      type: type || 'response',
      timestamp: new Date().toISOString(),
    };
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: feedbackKey,
      Body: JSON.stringify(feedbackData, null, 2),
      ContentType: 'application/json',
    });
    await s3Client.send(putCommand);

    cache.delete(prefix);

    res.json({ success: true, message: 'Feedback saved successfully' });
  } catch (error) {
    console.error(`Save feedback error for ${prefix}:`, error);
    res.status(500).json({ error: 'Error saving feedback', details: error.message });
  }
});

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function getExistingData() {
  const key = 'Usernames/instagram.json';
  const prefix = 'Usernames/';

  if (cache.has(prefix)) {
    console.log(`Cache hit for ${prefix}`);
    const cachedData = cache.get(prefix);
    const data = cachedData.find(item => item.key === key)?.data;
    return data || [];
  }

  try {
    const command = new GetObjectCommand({
      Bucket: 'tasks',
      Key: key,
    });
    const data = await s3Client.send(command);
    const body = await streamToString(data.Body);

    if (!body || body.trim() === '') {
      return [];
    }

    const parsedData = JSON.parse(body);
    cache.set(prefix, [{ key, data: parsedData }]);
    cacheTimestamps.set(prefix, Date.now());
    return Array.isArray(parsedData) ? parsedData : [];
  } catch (error) {
    if (error.name === 'NoSuchKey') {
      return [];
    }
    throw error;
  }
}

async function saveToR2(data) {
  const key = 'Usernames/instagram.json';
  const prefix = 'Usernames/';
  const command = new PutObjectCommand({
    Bucket: 'tasks',
    Key: key,
    Body: JSON.stringify(data, null, 2),
    ContentType: 'application/json',
  });
  await s3Client.send(command);
  cache.delete(prefix);
}

function handleErrorResponse(res, error) {
  const statusCode = error.name === 'TimeoutError' ? 504 : 500;
  res.status(statusCode).json({
    error: error.name || 'Internal server error',
    message: error.message || 'An unexpected error occurred',
  });
}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Ready to receive account info at POST /save-account-info');
  console.log('Ready to handle R2 webhooks at POST /webhook/r2');
  console.log('Ready to stream events at GET /events/:username');
  console.log('Ready to receive hierarchical data at POST /scrape');
  console.log('Ready to retrieve data at GET /retrieve/:accountHolder/:competitor');
  console.log('Ready to retrieve strategies at GET /retrieve-strategies/:accountHolder');
  console.log('Ready to retrieve engagement strategies at GET /retrieve-engagement-strategies/:accountHolder');
  console.log('Ready to retrieve news at GET /news-for-you/:accountHolder');
  console.log('Ready to save queries at POST /save-query/:accountHolder');
  console.log('Ready to handle rules at GET/POST /rules/:username');
  console.log('Ready to handle responses at GET/POST /responses/:username');
  console.log('Ready to handle posts at GET /posts/:username');
  console.log('Ready to handle feedback at POST /feedback/:username');
  console.log('Ready to retrieve profile info at GET /profile-info/:username');
});