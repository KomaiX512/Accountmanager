import express from 'express';
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import axios from 'axios';
import cors from 'cors';
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage() });
import puppeteer from 'puppeteer';
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
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: '*',
  exposedHeaders: ['Content-Type'],
}));

app.use(express.json());

app.options('*', (req, res) => {
  console.log(`[${new Date().toISOString()}] OPTIONS request received for ${req.url}`);
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': 'Content-Type',
  });
  res.status(204).send();
});

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

    if (event === 'ObjectCreated:Put' || event === 'ObjectCreated:Post' || event === 'ObjectRemoved:Delete') {
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

  console.log(`[${new Date().toISOString()}] Handling SSE request for /events/${username}`);

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': 'Content-Type',
    'X-Accel-Buffering': 'no',
    'Keep-Alive': 'timeout=15, max=100',
  });

  res.flushHeaders();

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

async function fetchDataForModule(username, prefixTemplate, forceRefresh = false) {
  if (!username) {
    console.error('No username provided, cannot fetch data');
    return [];
  }

  const prefix = prefixTemplate.replace('{username}', username);
  const now = Date.now();
  const lastFetch = cacheTimestamps.get(prefix) || 0;

  if (!forceRefresh && cache.has(prefix)) {
    console.log(`Cache hit for prefix: ${prefix}`);
    return cache.get(prefix);
  }

  if (!forceRefresh && now - lastFetch < THROTTLE_INTERVAL) {
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
    console.log(`Fetched data for prefix ${prefix}:`, JSON.stringify(validData, null, 2));
    return validData;
  } catch (error) {
    console.error(`Error fetching data for prefix ${prefix}:`, error);
    return [];
  }
}

app.get('/proxy-image', async (req, res) => {
  let { url } = req.query;
  if (!url) {
    return res.status(400).send('Image URL is required');
  }

  try {
    if (Array.isArray(url)) {
      url = url[0];
    }
    const decodedUrl = decodeURIComponent(url);

    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on('request', (request) => {
      if (request.resourceType() === 'image' || request.url() === decodedUrl) {
        request.continue();
      } else {
        request.abort();
      }
    });

    await page.goto(decodedUrl, { waitUntil: 'networkidle2' });

    const imageBuffer = await page.evaluate(async (url) => {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      return Array.from(new Uint8Array(buffer));
    }, decodedUrl);

    await browser.close();

    const buffer = Buffer.from(imageBuffer);

    res.set('Content-Type', 'image/jpeg');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', '*');
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');

    res.send(buffer);
  } catch (error) {
    console.error(`Failed to proxy image with Puppeteer: ${url}`, error);
    res.status(500).send('Failed to fetch image');
  }
});

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
  const forceRefresh = req.query.forceRefresh === 'true';

  try {
    const data = await fetchDataForModule(accountHolder, `competitor_analysis/{username}/${competitor}`, forceRefresh);
    console.log(`Returning data for ${accountHolder}/${competitor}:`, JSON.stringify(data, null, 2));
    res.json(data);
  } catch (error) {
    console.error(`Retrieve endpoint error for ${accountHolder}/${competitor}:`, error);
    res.status(500).json({ error: 'Error retrieving data', details: error.message });
  }
});

app.get('/retrieve-multiple/:accountHolder', async (req, res) => {
  const { accountHolder } = req.params;
  const competitorsParam = req.query.competitors;
  const forceRefresh = req.query.forceRefresh === 'true';

  if (!competitorsParam || typeof competitorsParam !== 'string') {
    return res.status(400).json({ error: 'Competitors query parameter is required and must be a string' });
  }

  const competitors = competitorsParam.split(',').map(c => c.trim()).filter(c => c.length > 0);

  try {
    const results = await Promise.all(
      competitors.map(async (competitor) => {
        const data = await fetchDataForModule(accountHolder, `competitor_analysis/{username}/${competitor}`, forceRefresh);
        return { competitor, data };
      })
    );
    res.json(results);
  } catch (error) {
    console.error(`Retrieve multiple endpoint error for ${accountHolder}:`, error);
    res.status(500).json({ error: 'Error retrieving data for multiple competitors', details: error.message });
  }
});

app.get('/retrieve-strategies/:accountHolder', async (req, res) => {
  const { accountHolder } = req.params;
  const forceRefresh = req.query.forceRefresh === 'true';

  try {
    const data = await fetchDataForModule(accountHolder, 'recommendations/{username}', forceRefresh);
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
  const forceRefresh = req.query.forceRefresh === 'true';

  try {
    const data = await fetchDataForModule(accountHolder, 'engagement_strategies/{username}', forceRefresh);
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
  const forceRefresh = req.query.forceRefresh === 'true';

  try {
    const data = await fetchDataForModule(accountHolder, 'NewForYou/{username}', forceRefresh);
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
  const forceRefresh = req.query.forceRefresh === 'true';

  try {
    const data = await fetchDataForModule(username, 'queries/{username}', forceRefresh);
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

app.get('/retrieve-account-info/:username', async (req, res) => {
  const { username } = req.params;
  const key = `AccountInfo/${username}/info.json`;
  const prefix = `AccountInfo/${username}`;

  try {
    let data;
    if (cache.has(prefix)) {
      console.log(`Cache hit for account info: ${prefix}`);
      const cachedData = cache.get(prefix);
      data = cachedData.find(item => item.key === key)?.data;
    }

    if (!data) {
      try {
        const getCommand = new GetObjectCommand({
          Bucket: 'tasks',
          Key: key,
        });
        const response = await s3Client.send(getCommand);
        const body = await streamToString(response.Body);

        if (!body || body.trim() === '') {
          console.warn(`Empty file detected at ${key}, returning default account info`);
          data = { username, accountType: '', postingStyle: '', competitors: [], timestamp: new Date().toISOString() };
        } else {
          data = JSON.parse(body);
          if (!data.competitors || !Array.isArray(data.competitors)) {
            console.warn(`Invalid competitors array in ${key}, setting to empty array`);
            data.competitors = [];
          }
        }

        cache.set(prefix, [{ key, data }]);
        cacheTimestamps.set(prefix, Date.now());
      } catch (error) {
        if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
          console.log(`Account info not found for ${key}, returning default account info`);
          data = { username, accountType: '', postingStyle: '', competitors: [], timestamp: new Date().toISOString() };
          cache.set(prefix, [{ key, data }]);
          cacheTimestamps.set(prefix, Date.now());
        } else {
          throw error;
        }
      }
    }

    console.log(`Returning account info for ${username}:`, JSON.stringify(data, null, 2));
    res.json(data);
  } catch (error) {
    console.error(`Error retrieving account info for ${key}:`, error.message);
    res.status(500).json({ error: 'Failed to retrieve account info', details: error.message });
  }
});

app.get('/posts/:username', async (req, res) => {
  const { username } = req.params;
  const forceRefresh = req.query.forceRefresh === 'true';
  const prefix = `ready_post/${username}/`;

  try {
    const now = Date.now();
    const lastFetch = cacheTimestamps.get(prefix) || 0;

    if (!forceRefresh && cache.has(prefix)) {
      console.log(`Cache hit for posts: ${prefix}`);
      return res.json(cache.get(prefix));
    }

    if (!forceRefresh && now - lastFetch < THROTTLE_INTERVAL) {
      console.log(`Throttled fetch for posts: ${prefix}`);
      return res.json(cache.has(prefix) ? cache.get(prefix) : []);
    }

    console.log(`Fetching posts from R2 for prefix: ${prefix}`);
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: prefix,
    });
    const listResponse = await s3Client.send(listCommand);

    const files = listResponse.Contents || [];
    const postFiles = files.filter(file => file.Key.match(/ready_post_\d+\.json$/));
    const imageFiles = files.filter(file => file.Key.match(/image_\d+\.jpg$/));

    const posts = await Promise.all(
      postFiles.map(async (file) => {
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

          const postData = JSON.parse(body);
          const postIdMatch = file.Key.match(/ready_post_(\d+)\.json$/);
          const postId = postIdMatch ? postIdMatch[1] : null;

          if (!postId) return null;

          const imageFile = imageFiles.find(img => img.Key === `${prefix}image_${postId}.jpg`);
          if (!imageFile) {
            console.warn(`No matching image found for post ${file.Key}, skipping...`);
            return null;
          }

          const imageCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: imageFile.Key,
          });
          const signedUrl = await getSignedUrl(s3Client, imageCommand, { expiresIn: 3600 });

          return {
            key: file.Key,
            data: {
              ...postData,
              image_url: signedUrl,
            },
          };
        } catch (error) {
          console.error(`Failed to process post ${file.Key}:`, error.message);
          return null;
        }
      })
    );

    const validPosts = posts.filter(post => post !== null);
    cache.set(prefix, validPosts);
    cacheTimestamps.set(prefix, now);
    console.log(`Returning posts for ${username}:`, JSON.stringify(validPosts, null, 2));
    res.json(validPosts);
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
// Instagram App Credentials
const APP_ID = '576296982152813';
const APP_SECRET = 'd48ddc9eaf0e5c4969d4ddc4e293178c';
const REDIRECT_URI = 'https://b8e8-121-52-146-243.ngrok-free.app/instagram/callback';
const VERIFY_TOKEN = 'myInstagramWebhook2025';


app.get('/instagram/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    console.log(`[${new Date().toISOString()}] OAuth callback failed: No code provided`);
    return res.status(400).send('Error: No code provided');
  }

  console.log(`[${new Date().toISOString()}] OAuth callback: Using redirect_uri=${REDIRECT_URI}`);

  try {
    // Step 1: Exchange code for short-lived access token
    const tokenResponse = await axios({
      method: 'post',
      url: 'https://api.instagram.com/oauth/access_token',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: new URLSearchParams({
        client_id: APP_ID,
        client_secret: APP_SECRET,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
        code: code
      })
    });

    const shortLivedToken = tokenResponse.data.access_token;
    const userIdFromAuth = tokenResponse.data.user_id;

    console.log(`[${new Date().toISOString()}] Short-lived token obtained: user_id=${userIdFromAuth}`);

    // Step 2: Exchange short-lived token for long-lived token
    const longLivedTokenResponse = await axios.get('https://graph.instagram.com/access_token', {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: APP_SECRET,
        access_token: shortLivedToken
      }
    });

    const longLivedToken = longLivedTokenResponse.data.access_token;
    const expiresIn = longLivedTokenResponse.data.expires_in;

    console.log(`[${new Date().toISOString()}] Long-lived token obtained`);

    // Step 3: Fetch profile with BOTH id and user_id from Graph
    const profileResponse = await axios.get('https://graph.instagram.com/me', {
      params: {
        fields: 'id,username,account_type,user_id',   // <--- HERE IS THE IMPORTANT FIX
        access_token: longLivedToken
      }
    });

    const profile = profileResponse.data;
    const idFromGraph = profile.id;
    const userIdFromGraph = profile.user_id;
    const username = profile.username;
    const accountType = profile.account_type;

    console.log(`[${new Date().toISOString()}] Profile fetched: id=${idFromGraph}, user_id=${userIdFromGraph}, username=${username}, account_type=${accountType}`);

    // Step 4: Store token and both IDs in R2
    const key = `InstagramTokens/${idFromGraph}/token.json`;
    const tokenData = {
      instagram_graph_id: idFromGraph,
      instagram_user_id: userIdFromGraph,
      access_token: longLivedToken,
      expires_in: expiresIn,
      username: username,
      account_type: accountType,
      timestamp: new Date().toISOString()
    };

    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(tokenData, null, 2),
      ContentType: 'application/json'
    });
    await s3Client.send(putCommand);

    console.log(`[${new Date().toISOString()}] Token and profile stored in R2 at ${key}`);

    // Invalidate cache
    cache.delete(`InstagramTokens/${idFromGraph}`);

    // Send success response
    res.send(`
      <html>
        <body>
          <h2>Instagram Connected Successfully!</h2>
          <p>Username: ${username}</p>
          <p>Graph ID: ${idFromGraph}</p>
          <p>User ID: ${userIdFromGraph}</p>
          <p>You can now close this window and return to the dashboard.</p>
          <script>
            window.opener.postMessage({ 
              type: 'INSTAGRAM_CONNECTED', 
              graphId: '${idFromGraph}', 
              userId: '${userIdFromGraph}',
              username: '${username}'
            }, '*');
            window.close();
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] OAuth callback error:`, error.response?.data || error.message);
    res.status(500).send('Error connecting Instagram account');
  }
});


// Instagram Webhook Verification
app.get('/webhook/instagram', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log(`[${new Date().toISOString()}] WEBHOOK_VERIFIED for Instagram`);
    res.status(200).send(challenge);
  } else {
    console.log(`[${new Date().toISOString()}] WEBHOOK_VERIFICATION_FAILED: Invalid token or mode`);
    res.sendStatus(403);
  }
});
// Instagram Webhook Receiver
app.post('/webhook/instagram', async (req, res) => {
  const body = req.body;

  if (body.object !== 'instagram') {
    console.log(`[${new Date().toISOString()}] Invalid payload received, not Instagram object`);
    return res.sendStatus(404);
  }

  console.log(`[${new Date().toISOString()}] WEBHOOK ➜ Instagram payload received: ${JSON.stringify(body)}`);

  try {
    for (const entry of body.entry) {
      const igGraphId = entry.id;
      console.log(`[${new Date().toISOString()}] Processing entry for IG Graph ID: ${igGraphId}`);

      // ————— Handle Direct Messages —————
      if (Array.isArray(entry.messaging)) {
        for (const msg of entry.messaging) {
          // ignore non-text or echo messages
          if (!msg.message?.text || msg.message.is_echo) {
            console.log(`[${new Date().toISOString()}] Skipping non-text or echo message: ${JSON.stringify(msg.message)}`);
            continue;
          }

          const eventData = {
            type:               'message',
            instagram_graph_id: igGraphId,
            sender_id:          msg.sender.id,
            message_id:         msg.message.mid,
            text:               msg.message.text,
            timestamp:          msg.timestamp,
            received_at:        new Date().toISOString()
          };

          console.log(`[${new Date().toISOString()}] Storing DM event: ${eventData.message_id}`);

          // write to R2: InstagramEvents/<IG_GRAPH_ID>/<message_id>.json
          const key = `InstagramEvents/${igGraphId}/${eventData.message_id}.json`;
          await s3Client.send(new PutObjectCommand({
            Bucket:      'tasks',
            Key:         key,
            Body:        JSON.stringify(eventData, null, 2),
            ContentType: 'application/json'
          }));

          console.log(`[${new Date().toISOString()}] Stored DM in R2 at ${key}`);

          // broadcast via SSE if any clients connected
          const clients = sseClients[igGraphId] || [];
          if (clients.length) {
            console.log(`[${new Date().toISOString()}] Broadcasting to ${clients.length} SSE client(s)`);
            clients.forEach(client => {
              client.write(`data: ${JSON.stringify({ event: 'message', data: eventData })}\n\n`);
            });
          }
        }
      }

      // ————— Handle Comments —————
      if (Array.isArray(entry.changes)) {
        for (const change of entry.changes) {
          if (change.field !== 'comments' || !change.value?.text) {
            console.log(`[${new Date().toISOString()}] Skipping non-comment change: ${JSON.stringify(change)}`);
            continue;
          }

          const eventData = {
            type:               'comment',
            instagram_graph_id: igGraphId,
            comment_id:         change.value.id,
            text:               change.value.text,
            post_id:            change.value.media.id,
            timestamp:          change.value.timestamp || Date.now(),
            received_at:        new Date().toISOString()
          };

          console.log(`[${new Date().toISOString()}] Storing comment event: ${eventData.comment_id}`);

          const key = `InstagramEvents/${igGraphId}/comment_${eventData.comment_id}.json`;
          await s3Client.send(new PutObjectCommand({
            Bucket:      'tasks',
            Key:         key,
            Body:        JSON.stringify(eventData, null, 2),
            ContentType: 'application/json'
          }));

          console.log(`[${new Date().toISOString()}] Stored comment in R2 at ${key}`);

          const clients = sseClients[igGraphId] || [];
          if (clients.length) {
            console.log(`[${new Date().toISOString()}] Broadcasting comment to ${clients.length} SSE client(s)`);
            clients.forEach(client => {
              client.write(`data: ${JSON.stringify({ event: 'comment', data: eventData })}\n\n`);
            });
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error processing webhook:`, err);
    res.sendStatus(500);
  }
});

app.post('/send-dm-reply/:userId', async (req, res) => {
  const { userId } = req.params;
  const { sender_id, text, message_id } = req.body;

  if (!sender_id || !text || !message_id) {
    console.log(`[${new Date().toISOString()}] Missing required fields for DM reply`);
    return res.status(400).send('Missing sender_id, text, or message_id');
  }

  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `InstagramTokens/`,
    });
    const { Contents } = await s3Client.send(listCommand);

    let tokenData = null;
    let tokenKey = null;
    if (Contents) {
      for (const obj of Contents) {
        if (obj.Key.endsWith('/token.json')) {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: obj.Key,
          });
          const data = await s3Client.send(getCommand);
          const json = await data.Body.transformToString();
          const token = JSON.parse(json);
          if (token.instagram_user_id === userId) {
            tokenData = token;
            tokenKey = obj.Key;
            break;
          }
        }
      }
    }

    if (!tokenData || !tokenKey) {
      console.log(`[${new Date().toISOString()}] No token found for instagram_user_id ${userId}`);
      return res.status(404).send('No access token found for this Instagram account');
    }

    const access_token = tokenData.access_token;
    const instagram_graph_id = tokenData.instagram_graph_id;

    const response = await axios({
      method: 'post',
      url: `https://graph.instagram.com/v21.0/${instagram_graph_id}/messages`,
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      data: {
        recipient: { id: sender_id },
        message: { text },
      },
    });

    console.log(`[${new Date().toISOString()}] DM reply sent to ${sender_id} for instagram_graph_id ${instagram_graph_id}`);

    const replyKey = `InstagramEvents/${userId}/reply_${message_id}_${Date.now()}.json`;
    const replyData = {
      type: 'reply',
      instagram_user_id: userId,
      instagram_graph_id: instagram_graph_id,
      recipient_id: sender_id,
      message_id: response.data.id || `reply_${Date.now()}`,
      text,
      timestamp: Date.now(),
      sent_at: new Date().toISOString(),
    };
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: replyKey,
      Body: JSON.stringify(replyData, null, 2),
      ContentType: 'application/json',
    });
    await s3Client.send(putCommand);

    console.log(`[${new Date().toISOString()}] Reply stored in R2 at ${replyKey}`);

    const messageKey = `InstagramEvents/${userId}/${message_id}.json`;
    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: 'tasks',
        Key: messageKey,
      }));
      console.log(`[${new Date().toISOString()}] Deleted message from R2 at ${messageKey}`);
      cache.delete(`InstagramEvents/${userId}`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error deleting message from R2:`, error);
    }

    res.json({ success: true, message_id: response.data.id });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error sending DM reply:`, error.response?.data || error.message);
    res.status(500).send('Error sending DM reply');
  }
});

app.post('/ignore-notification/:userId', async (req, res) => {
  const { userId } = req.params;
  const { message_id, comment_id } = req.body;

  if (!message_id && !comment_id) {
    console.log(`[${new Date().toISOString()}] Missing message_id or comment_id for ignore action`);
    return res.status(400).json({ error: 'Missing message_id or comment_id' });
  }

  try {
    const fileKey = message_id 
      ? `InstagramEvents/${userId}/${message_id}.json`
      : `InstagramEvents/${userId}/comment_${comment_id}.json`;

    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: 'tasks',
        Key: fileKey,
      }));
      console.log(`[${new Date().toISOString()}] Deleted notification from R2 at ${fileKey}`);
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        console.log(`[${new Date().toISOString()}] Notification file not found at ${fileKey}, proceeding`);
      } else {
        throw error;
      }
    }

    cache.delete(`InstagramEvents/${userId}`);
    res.json({ success: true });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error ignoring notification:`, error.message || error);
    res.status(500).json({ error: 'Failed to ignore notification', details: error.message || 'Unknown error' });
  }
});


// Public R2.dev URL
const R2_PUBLIC_URL = 'https://pub-ba72672df3c041a3844f278dd3c32b22.r2.dev';

app.post('/schedule-post/:userId', upload.single('image'), async (req, res) => {
  const { userId } = req.params;
  const { caption, scheduleDate } = req.body;
  const file = req.file;

  console.log(`[${new Date().toISOString()}] Received schedule-post request for user ${userId}: image=${!!file}, caption=${!!caption}, scheduleDate=${scheduleDate}`);

  if (!file || !caption || !scheduleDate) {
    console.log(`[${new Date().toISOString()}] Missing required fields: image=${!!file}, caption=${!!caption}, scheduleDate=${!!scheduleDate}`);
    return res.status(400).json({ error: 'Missing image, caption, or scheduleDate' });
  }

  try {
    // Validate image file type
    let format;
    try {
      const fileInfo = await fileType.fromBuffer(file.buffer);
      format = fileInfo?.mime.split('/')[1];
      console.log(`[${new Date().toISOString()}] Image format (file-type): ${format || 'unknown'}, mime: ${file.mimetype}, size: ${file.size} bytes, buffer_length: ${file.buffer.length}`);
    } catch (fileTypeError) {
      console.error(`[${new Date().toISOString()}] fileType validation failed:`, fileTypeError.message);
      format = file.mimetype.split('/')[1]; // Fallback to multer mime
    }
    if (!format || !['jpeg', 'png'].includes(format)) {
      console.log(`[${new Date().toISOString()}] Invalid image format: ${format || 'unknown'}`);
      return res.status(400).json({ error: 'Image must be JPEG or PNG' });
    }
    if (file.size > 8 * 1024 * 1024) {
      console.log(`[${new Date().toISOString()}] Image size too large: ${file.size} bytes`);
      return res.status(400).json({ error: 'Image size exceeds 8MB' });
    }

    // Validate caption
    if (caption.length > 2200) {
      console.log(`[${new Date().toISOString()}] Caption too long: ${caption.length} characters`);
      return res.status(400).json({ error: 'Caption exceeds 2200 characters' });
    }
    const hashtags = (caption.match(/#[^\s#]+/g) || []).length;
    if (hashtags > 30) {
      console.log(`[${new Date().toISOString()}] Too many hashtags: ${hashtags}`);
      return res.status(400).json({ error: 'Maximum 30 hashtags allowed' });
    }

    // Validate schedule date (within 75 days)
    const scheduleTime = new Date(scheduleDate);
    const now = new Date();
    const maxDate = new Date(now.getTime() + 75 * 24 * 60 * 60 * 1000);
    if (scheduleTime <= now || scheduleTime > maxDate) {
      console.log(`[${new Date().toISOString()}] Invalid schedule date: ${scheduleDate}`);
      return res.status(400).json({ error: 'Schedule date must be within 75 days from now' });
    }

    // Fetch access token
    console.log(`[${new Date().toISOString()}] Fetching token for user ${userId}`);
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `InstagramTokens/`,
    });
    const { Contents } = await s3Client.send(listCommand);

    let tokenData = null;
    if (Contents) {
      for (const key of Contents) {
        if (key.Key.endsWith('/token.json')) {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: key.Key,
          });
          const data = await s3Client.send(getCommand);
          const json = await data.Body.transformToString();
          const token = JSON.parse(json);
          if (token.instagram_user_id === userId) {
            tokenData = token;
            break;
          }
        }
      }
    }

    if (!tokenData) {
      console.log(`[${new Date().toISOString()}] No token found for instagram_user_id ${userId}`);
      return res.status(404).json({ error: 'No access token found for this Instagram account' });
    }

    const access_token = tokenData.access_token;
    const instagram_graph_id = tokenData.instagram_graph_id;
    console.log(`[${new Date().toISOString()}] Token found: graph_id=${instagram_graph_id}`);

    // Upload image to R2
    const imageKey = `InstagramEvents/${userId}/${file.originalname}`;
    console.log(`[${new Date().toISOString()}] Uploading image to R2: ${imageKey}, ContentType: ${file.mimetype}`);
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: imageKey,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'public-read',
    });
    await s3Client.send(putCommand);

    // Test R2 URL accessibility
    const imageUrl = `${R2_PUBLIC_URL}/${imageKey}`;
    console.log(`[${new Date().toISOString()}] Testing R2 image URL: ${imageUrl}`);
    let urlAccessible = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const urlTest = await axios.head(imageUrl, { timeout: 5000 });
        console.log(`[${new Date().toISOString()}] R2 URL accessible (attempt ${attempt}): ${urlTest.status}`);
        urlAccessible = true;
        break;
      } catch (urlError) {
        console.error(`[${new Date().toISOString()}] R2 URL inaccessible (attempt ${attempt}):`, urlError.message, urlError.response?.status || '');
        if (attempt === 3) {
          throw new Error(`Image URL is not publicly accessible after ${attempt} attempts`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!urlAccessible) {
      throw new Error('Image URL is not publicly accessible');
    }

    // Create media object
    console.log(`[${new Date().toISOString()}] Creating media object for graph_id ${instagram_graph_id}`);
    const mediaResponse = await axios.post(
      `https://graph.instagram.com/v21.0/${instagram_graph_id}/media`,
      {
        image_url: imageUrl,
        caption,
        is_carousel_item: false,
      },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const mediaId = mediaResponse.data.id;
    if (!mediaId) {
      console.log(`[${new Date().toISOString()}] Failed to create media object: ${JSON.stringify(mediaResponse.data)}`);
      throw new Error('Failed to create media object');
    }
    console.log(`[${new Date().toISOString()}] Media object created: media_id=${mediaId}`);

    // Schedule post
    console.log(`[${new Date().toISOString()}] Scheduling post for ${scheduleDate}`);
    const publishResponse = await axios.post(
      `https://graph.instagram.com/v21.0/${instagram_graph_id}/media_publish`,
      {
        creation_id: mediaId,
        publish_time: Math.floor(scheduleTime.getTime() / 1000), // UNIX timestamp
      },
      {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      }
    );

    const postId = publishResponse.data.id;
    console.log(`[${new Date().toISOString()}] Post scheduled: post_id=${postId}`);

    // Store scheduled post details in R2
    const scheduledPostKey = `InstagramScheduledPosts/${userId}/${postId}.json`;
    const scheduledPostData = {
      userId,
      instagram_graph_id,
      media_id: mediaId,
      post_id: postId,
      caption,
      image_key: imageKey,
      schedule_time: scheduleTime.toISOString(),
      created_at: new Date().toISOString(),
      status: 'scheduled',
    };
    console.log(`[${new Date().toISOString()}] Storing scheduled post: ${scheduledPostKey}`);
    const putScheduledCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: scheduledPostKey,
      Body: JSON.stringify(scheduledPostData, null, 2),
      ContentType: 'application/json',
    });
    await s3Client.send(putScheduledCommand);

    // Clean up image
    console.log(`[${new Date().toISOString()}] Cleaning up image: ${imageKey}`);
    await s3Client.send(new DeleteObjectCommand({
      Bucket: 'tasks',
      Key: imageKey,
    }));

    console.log(`[${new Date().toISOString()}] Post scheduled for user ${userId} with post ID ${postId}`);
    res.json({ success: true, post_id: postId, status: 'scheduled', message: 'Post scheduled successfully.' });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error scheduling post:`, error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to schedule post', details: error.response?.data?.error?.message || error.message });
  }
});
app.get('/insights/:userId', async (req, res) => {
  const { userId } = req.params;
  console.log(`[${new Date().toISOString()}] Received insights request for user ${userId}`);

  try {
    // Fetch access token
    console.log(`[${new Date().toISOString()}] Fetching token for user ${userId}`);
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `InstagramTokens/`,
    });
    const { Contents } = await s3Client.send(listCommand);

    let tokenData = null;
    if (Contents) {
      for (const key of Contents) {
        if (key.Key.endsWith('/token.json')) {
          const getCommand = new GetObjectCommand({
            Bucket: 'tasks',
            Key: key.Key,
          });
          const data = await s3Client.send(getCommand);
          const json = await data.Body.transformToString();
          const token = JSON.parse(json);
          if (token.instagram_user_id === userId) {
            tokenData = token;
            break;
          }
        }
      }
    }

    if (!tokenData) {
      console.log(`[${new Date().toISOString()}] No token found for instagram_user_id ${userId}`);
      return res.status(404).json({ error: 'No access token found for this Instagram account' });
    }

    const access_token = tokenData.access_token;
    const instagram_graph_id = tokenData.instagram_graph_id;
    console.log(`[${new Date().toISOString()}] Token found: graph_id=${instagram_graph_id}`);

    // Fetch follower_count directly to ensure accuracy
    let follower_count = 0;
    try {
      const profileResponse = await axios.get(`https://graph.instagram.com/v22.0/me`, {
        params: {
          fields: 'followers_count',
          access_token,
        },
      });
      follower_count = profileResponse.data.followers_count || 0;
      console.log(`[${new Date().toISOString()}] Fetched follower_count: ${follower_count}`);
    } catch (profileError) {
      console.error(`[${new Date().toISOString()}] Error fetching follower_count:`, profileError.response?.data || profileError.message);
    }

    // Fetch insights
    console.log(`[${new Date().toISOString()}] Fetching insights from Instagram Graph API v22.0`);
    const metrics = ['reach', 'audience_gender_age', 'audience_locale'];
    let insightsData = {
      follower_count: { lifetime: follower_count },
      reach: { daily: [], lifetime: null },
      audience_gender_age: { lifetime: {} },
      audience_locale: { lifetime: {} },
    };

    for (const metric of metrics) {
      try {
        const response = await axios.get(`https://graph.instagram.com/v22.0/${instagram_graph_id}/insights`, {
          params: {
            metric,
            period: metric === 'reach' ? 'day' : 'lifetime',
            access_token,
          },
        });
        response.data.data.forEach((item) => {
          if (item.name === 'reach' && item.period === 'day') {
            insightsData.reach.daily = item.values.map(v => ({
              value: v.value,
              end_time: v.end_time,
            }));
          } else if (item.period === 'lifetime') {
            insightsData[item.name].lifetime = item.values[0]?.value || {};
          }
        });
        console.log(`[${new Date().toISOString()}] Fetched metric: ${metric}`);
      } catch (error) {
        console.error(`[${new Date().toISOString()}] Failed to fetch metric ${metric}:`, error.response?.data || error.message);
      }
    }

    // Store in R2
    const insightsKey = `InstagramInsights/${userId}/${Date.now()}.json`;
    const insightsToStore = {
      data: insightsData,
      timestamp: new Date().toISOString(),
    };
    console.log(`[${new Date().toISOString()}] Storing insights in R2: ${insightsKey}`);
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: insightsKey,
      Body: JSON.stringify(insightsToStore, null, 2),
      ContentType: 'application/json',
      ACL: 'public-read',
    });
    await s3Client.send(putCommand);

    // Update latest cache
    console.log(`[${new Date().toISOString()}] Updating latest insights cache: InstagramInsights/${userId}/latest.json`);
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: `InstagramInsights/${userId}/latest.json`,
      Body: JSON.stringify(insightsToStore, null, 2),
      ContentType: 'application/json',
      ACL: 'public-read',
    }));

    console.log(`[${new Date().toISOString()}] Insights fetched and stored for user ${userId}`);
    res.json(insightsData);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error fetching insights:`, error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch insights', details: error.response?.data?.error?.message || error.message });
  }
});
// Instagram Deauthorize Callback
app.post('/instagram/deauthorize', (req, res) => {
  console.log(`[${new Date().toISOString()}] Deauthorize callback received:`, JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

// Instagram Data Deletion Request
app.get('/instagram/data-deletion', (req, res) => {
  const signedRequest = req.query.signed_request;
  console.log(`[${new Date().toISOString()}] Data deletion request received:`, signedRequest);
  res.json({
    url: 'https://b8e8-121-52-146-243.ngrok-free.app/instagram/data-deletion',
    confirmation_code: `delete_${Date.now()}`
  });
});

app.post('/instagram/data-deletion', (req, res) => {
  console.log(`[${new Date().toISOString()}] Data deletion POST request received:`, JSON.stringify(req.body, null, 2));
  res.json({
    url: 'https://b8e8-121-52-146-243.ngrok-free.app/instagram/data-deletion',
    confirmation_code: `delete_${Date.now()}`
  });
});

// New Endpoint: List Stored Events
app.get('/events-list/:userId', async (req, res) => {
  const userId = req.params.userId;

  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: `InstagramEvents/${userId}/`
    });
    const { Contents } = await s3Client.send(listCommand);

    const events = [];
    if (Contents) {
      for (const obj of Contents) {
        const getCommand = new GetObjectCommand({
          Bucket: 'tasks',
          Key: obj.Key
        });
        const { Body } = await s3Client.send(getCommand);
        const data = await Body.transformToString();
        events.push(JSON.parse(data));
      }
    }

    console.log(`[${new Date().toISOString()}] Retrieved ${events.length} events for user ${userId}`);
    res.json(events);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error retrieving events for user ${userId}:`, error);
    res.status(500).send('Error retrieving events');
  }
});

// SSE Endpoint
app.get('/events/:userId', (req, res) => {
  const userId = req.params.userId;
  console.log(`[${new Date().toISOString()}] Handling SSE request for /events/${userId}`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*'); // Ensure CORS for SSE
  res.flushHeaders();

  if (!sseClients[userId]) {
    sseClients[userId] = [];
  }

  sseClients[userId].push(res);
  console.log(`[${new Date().toISOString()}] SSE client connected for ${userId}. Total clients: ${sseClients[userId].length}`);

  // Send heartbeat every 30 seconds
  const heartbeatInterval = setInterval(() => {
    res.write('data: {"type":"heartbeat"}\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeatInterval);
    sseClients[userId] = sseClients[userId].filter(client => client !== res);
    console.log(`[${new Date().toISOString()}] SSE client disconnected for ${userId}. Total clients: ${sseClients[userId].length}`);
    res.end();
  });
});

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
  console.log('Ready to handle Instagram OAuth at GET /instagram/callback');
  console.log('Ready to handle Instagram webhooks at GET/POST /webhook/instagram');
  console.log('Ready to handle Instagram deauthorization at POST /instagram/deauthorize');
  console.log('Ready to handle Instagram data deletion at GET/POST /instagram/data-deletion');
});