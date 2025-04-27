const express = require('express');
const axios = require('axios');
const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const s3Client = new S3Client({ region: 'auto', /* other R2 config */ });
const sseClients = {};

// Instagram App Credentials
const APP_ID = '576296982152813';
const APP_SECRET = 'd48ddc9eaf0e5c4969d4ddc4e293178c';
const REDIRECT_URI = 'https://b8e8-121-52-146-243.ngrok-free.app/instagram/callback';
const VERIFY_TOKEN = 'myInstagramWebhook2025';

const instagramIdMappingCache = {};
const senderUsernameMappingCache = {};

// Save OAuth user mapping (OAuth ID and username)
async function saveUserMapping(oauthUserId, accessToken) {
  try {
    const response = await axios.get('https://graph.instagram.com/me', {
      params: { fields: 'id,username', access_token: accessToken }
    });
    const instagramId = response.data.id; // Should match oauthUserId
    const username = response.data.username;
    const mappingData = { oauth_user_id: oauthUserId, username: username };

    const key = `InstagramUserMapping/${oauthUserId}.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(mappingData, null, 2),
      ContentType: 'application/json'
    }));

    instagramIdMappingCache[instagramId] = { oauthUserId, username };
    console.log(`[Mapping] Saved OAuth mapping: ${oauthUserId} (${username})`);
  } catch (error) {
    console.error(`[Mapping] Error saving OAuth mapping:`, error.response?.data || error.message);
  }
}

// Save sender mapping (Webhook ID and sender's username)
async function saveSenderMapping(senderId, accessToken) {
  try {
    const response = await axios.get(`https://graph.instagram.com/${senderId}`, {
      params: { fields: 'username', access_token: accessToken }
    });
    const senderUsername = response.data.username;
    const mappingData = { webhook_user_id: senderId, username: senderUsername };

    const key = `SenderUsernameMapping/${senderId}.json`;
    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(mappingData, null, 2),
      ContentType: 'application/json'
    }));

    senderUsernameMappingCache[senderUsername] = senderUsernameMappingCache[senderUsername] || [];
    if (!senderUsernameMappingCache[senderUsername].includes(senderId)) {
      senderUsernameMappingCache[senderUsername].push(senderId);
    }
    console.log(`[Mapping] Saved sender mapping: Webhook ${senderId} -> ${senderUsername}`);
  } catch (error) {
    console.error(`[Mapping] Error saving sender mapping for ${senderId}:`, error.response?.data || error.message);
  }
}

// Load OAuth user mapping by Instagram ID
async function loadUserMapping(instagramId) {
  if (instagramIdMappingCache[instagramId]) return instagramIdMappingCache[instagramId].oauthUserId;

  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'InstagramUserMapping/'
    });
    const { Contents } = await s3Client.send(listCommand);

    if (Contents) {
      for (const obj of Contents) {
        const getCommand = new GetObjectCommand({ Bucket: 'tasks', Key: obj.Key });
        const { Body } = await s3Client.send(getCommand);
        const data = await Body.transformToString();
        const mapping = JSON.parse(data);
        instagramIdMappingCache[mapping.oauth_user_id] = { oauthUserId: mapping.oauth_user_id, username: mapping.username };
      }
    }
    return instagramIdMappingCache[instagramId]?.oauthUserId || null;
  } catch (error) {
    console.error(`[Mapping] Error loading OAuth mappings:`, error);
    return null;
  }
}

// Probe Webhook ID (sender's ID) by username
async function getWebhookIdByUsername(username) {
  if (senderUsernameMappingCache[username] && senderUsernameMappingCache[username].length > 0) {
    // Return the most recent sender ID (last in array)
    return senderUsernameMappingCache[username][senderUsernameMappingCache[username].length - 1];
  }

  try {
    const listCommand = new ListObjectsV2Command({
      Bucket: 'tasks',
      Prefix: 'SenderUsernameMapping/'
    });
    const { Contents } = await s3Client.send(listCommand);

    if (Contents) {
      for (const obj of Contents) {
        const getCommand = new GetObjectCommand({ Bucket: 'tasks', Key: obj.Key });
        const { Body } = await s3Client.send(getCommand);
        const data = await Body.transformToString();
        const mapping = JSON.parse(data);
        senderUsernameMappingCache[mapping.username] = senderUsernameMappingCache[mapping.username] || [];
        if (!senderUsernameMappingCache[mapping.username].includes(mapping.webhook_user_id)) {
          senderUsernameMappingCache[mapping.username].push(mapping.webhook_user_id);
        }
      }
    }
    return senderUsernameMappingCache[username]?.[senderUsernameMappingCache[username].length - 1] || null;
  } catch (error) {
    console.error(`[Mapping] Error probing Webhook ID for username ${username}:`, error);
    return null;
  }
}

// Load access token by OAuth user ID
async function loadAccessToken(oauthUserId) {
  try {
    const getCommand = new GetObjectCommand({
      Bucket: 'tasks',
      Key: `InstagramTokens/${oauthUserId}/token.json`
    });
    const { Body } = await s3Client.send(getCommand);
    const data = await Body.transformToString();
    const tokenData = JSON.parse(data);
    return tokenData.access_token;
  } catch (error) {
    console.error(`[Token] Error loading access token for ${oauthUserId}:`, error);
    return null;
  }
}

// OAuth Callback
app.get('/instagram/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Error: No code provided');

  try {
    const tokenResponse = await axios.post('https://api.instagram.com/oauth/access_token', new URLSearchParams({
      client_id: APP_ID,
      client_secret: APP_SECRET,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
      code: code
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const shortLivedToken = tokenResponse.data.access_token;
    const oauthUserId = tokenResponse.data.user_id;

    const longLivedTokenResponse = await axios.get('https://graph.instagram.com/access_token', {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: APP_SECRET,
        access_token: shortLivedToken
      }
    });

    const longLivedToken = longLivedTokenResponse.data.access_token;
    const expiresIn = longLivedTokenResponse.data.expires_in;

    await saveUserMapping(oauthUserId, longLivedToken);

    await s3Client.send(new PutObjectCommand({
      Bucket: 'tasks',
      Key: `InstagramTokens/${oauthUserId}/token.json`,
      Body: JSON.stringify({ instagram_user_id: oauthUserId, access_token: longLivedToken, expires_in: expiresIn, timestamp: new Date().toISOString() }, null, 2),
      ContentType: 'application/json'
    }));

    res.send('<h2>Instagram Connected Successfully!</h2> You can close this window.');
  } catch (error) {
    console.error('[OAuth Error]:', error.response?.data || error.message);
    res.status(500).send('Error connecting Instagram account');
  }
});

// Webhook Verification
app.get('/webhook/instagram', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('[Webhook] Verified successfully.');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook Receiver
app.post('/webhook/instagram', async (req, res) => {
  const body = req.body;

  if (body.object === 'instagram') {
    for (const entry of body.entry) {
      const recipientId = entry.id; // OAuth ID
      const oauthUserId = await loadUserMapping(recipientId) || recipientId;
      const accessToken = await loadAccessToken(oauthUserId);

      if (entry.messaging) {
        for (const message of entry.messaging) {
          if (!message.message?.text) continue;
          const senderId = message.sender.id; // Webhook ID
          if (senderId === recipientId) continue; // Skip if sender is the recipient

          // Save sender mapping
          if (accessToken) await saveSenderMapping(senderId, accessToken);

          const eventData = {
            type: 'message',
            instagram_user_id: oauthUserId,
            webhook_user_id: senderId,
            message_id: message.message.mid,
            text: message.message.text,
            timestamp: message.timestamp,
            received_at: new Date().toISOString()
          };

          await s3Client.send(new PutObjectCommand({
            Bucket: 'tasks',
            Key: `InstagramEvents/${senderId}/${eventData.message_id}.json`,
            Body: JSON.stringify(eventData, null, 2),
            ContentType: 'application/json'
          }));
        }
      }

      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === 'comments' && change.value.text) {
            const eventData = {
              type: 'comment',
              instagram_user_id: oauthUserId,
              comment_id: change.value.id,
              text: change.value.text,
              post_id: change.value.media.id,
              timestamp: change.value.timestamp || Date.now(),
              received_at: new Date().toISOString()
            };

            await s3Client.send(new PutObjectCommand({
              Bucket: 'tasks',
              Key: `InstagramEvents/${oauthUserId}/comment_${eventData.comment_id}.json`,
              Body: JSON.stringify(eventData, null, 2),
              ContentType: 'application/json'
            }));
          }
        }
      }
    }

    res.sendStatus(200);
  } else {
    res.sendStatus(404);
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

// List Stored Events (by Webhook ID)
app.get('/events-list/:userId', async (req, res) => {
  const userId = req.params.userId; // Webhook ID (sender's ID)

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

    console.log(`[${new Date().toISOString()}] Retrieved ${events.length} events for Webhook ID ${userId}`);
    res.json(events);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error retrieving events for Webhook ID ${userId}:`, error);
    res.status(500).send('Error retrieving events');
  }
});

// SSE Endpoint (by Webhook ID)
app.get('/events/:userId', (req, res) => {
  const userId = req.params.userId; // Webhook ID (sender's ID)
  console.log(`[${new Date().toISOString()}] Handling SSE request for /events/${userId}`);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!sseClients[userId]) {
    sseClients[userId] = [];
  }

  sseClients[userId].push(res);
  console.log(`[${new Date().toISOString()}] SSE client connected for ${userId}. Total clients: ${sseClients[userId].length}`);

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

// Start server
app.listen(3000, () => {
  console.log('Server running on port 3000');
});