# Instagram Integration Persistence

This document outlines how Instagram username entry and OAuth token persistence is implemented in the Account Manager application.

## 1. Instagram Username Entry Persistence

### Storage Structure

The Instagram username entry state is stored in the Cloudflare R2 bucket at:
```
UserInstagramStatus/{userId}/status.json
```

The JSON file has the following structure:
```json
{
  "uid": "firebase_user_id",
  "hasEnteredInstagramUsername": true,
  "instagram_username": "example_user",
  "lastUpdated": "2023-08-15T12:00:00.000Z"
}
```

### API Endpoints

Two endpoints handle this functionality:

1. `GET /user-instagram-status/:userId` - Checks if a user has entered their Instagram username
2. `POST /user-instagram-status/:userId` - Updates the user's Instagram username entry state

### Flow

1. When a user logs in, the application checks if they've already entered their Instagram username by calling `GET /user-instagram-status/:userId`
2. If `hasEnteredInstagramUsername` is `false` or the file doesn't exist, the user is redirected to the Instagram username entry screen
3. After the user submits the form, the data is saved via `POST /user-instagram-status/:userId` and `hasEnteredInstagramUsername` is set to `true`
4. On subsequent logins, the user will be redirected directly to the dashboard

## 2. Instagram OAuth Integration Persistence

### Storage Structure

The Instagram OAuth integration is stored in:

1. **Browser LocalStorage:**
   - `instagram_user_id` - The Instagram user ID
   - `instagram_graph_id` - The Instagram Graph API ID
   - `instagram_username` - The Instagram username (optional)

2. **Cloudflare R2 bucket:**
   ```
   InstagramConnection/{userId}/connection.json
   ```

   The JSON file has the following structure:
   ```json
   {
     "uid": "firebase_user_id",
     "instagram_user_id": "instagram_user_id",
     "instagram_graph_id": "instagram_graph_id",
     "username": "example_user",
     "lastUpdated": "2023-08-15T12:00:00.000Z"
   }
   ```

### API Endpoints

Three endpoints handle this functionality:

1. `GET /instagram-connection/:userId` - Retrieves the user's Instagram connection
2. `POST /instagram-connection/:userId` - Stores the user's Instagram connection
3. `DELETE /instagram-connection/:userId` - Deletes the user's Instagram connection

### Token Lifecycle

1. **Initial Connection:**
   - User clicks "Connect Instagram" button
   - OAuth flow is initiated
   - Upon successful connection, token data is stored in both localStorage and R2 bucket

2. **Session Restoration:**
   - On page load, the InstagramConnect component checks localStorage first
   - If not found, it tries to retrieve from the R2 bucket
   - If connection data is found, the connection state is restored

3. **Token Validation:**
   - Currently, the system assumes the token is valid if found
   - For a more robust implementation, consider adding token expiration handling

4. **Disconnection:**
   - User clicks "Disconnect Instagram" button
   - Connection data is removed from localStorage and R2 bucket

### State Restoration Process

1. The `InstagramConnect` component checks for cached connection on mount
2. It first checks localStorage for faster access
3. If not found, it queries the backend for any stored connection
4. If found, the connection is restored and the Dashboard is updated
5. The Dashboard also checks localStorage for connection data on mount

## Edge Cases

1. **Failed Backend Storage:**
   - If storing to the backend fails, the connection will still work for the current browser session
   - The connection will be lost when the user clears localStorage or switches browsers

2. **Connection Data Mismatch:**
   - If the localStorage and backend data don't match, localStorage takes precedence
   - This is because localStorage provides a faster response

3. **Token Expiration:**
   - Instagram tokens can expire or be revoked
   - The system currently doesn't check for token validity
   - A future enhancement could include token validation and refresh logic

4. **Multiple Devices:**
   - The backend storage ensures connections can be restored across devices
   - However, each device will need to authenticate once to store in localStorage

## Security Considerations

1. The Instagram token is not stored directly in the system
2. Only the Instagram user ID and Graph API ID are stored
3. For additional security, consider encrypting the stored data 