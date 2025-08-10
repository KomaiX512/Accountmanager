# Facebook Entry Form Update Documentation

## Overview

The Facebook entry form has been updated to support a more flexible and user-friendly approach for collecting Facebook account information. The new structure supports both URL and name fields for better mapping and scraping capabilities.

## Key Changes

### 1. Dual Field Structure
- **Account Name**: Optional display name with no restrictions
- **Facebook URL**: Required valid Facebook page/profile URL for scraping

### 2. Competitor Structure
Each competitor now requires:
- **Competitor Name**: Optional display name for mapping
- **Competitor URL**: Required valid Facebook URL for analysis

## Form Structure

### Primary Account Section
```
┌─────────────────────────────────────────────────────────┐
│ Your Facebook Account Name * (CRITICAL)                │
│ [Text Input - No restrictions]                        │
│                                                        │
│ Your Facebook Page/Profile URL * (CRITICAL)           │
│ [URL Input - Must be valid Facebook URL]              │
└─────────────────────────────────────────────────────────┘
```

### Competitor Section
```
┌─────────────────────────────────────────────────────────┐
│ Competitor 1 * (Required)                             │
│ Name: [Text Input - No restrictions]                  │
│ URL: [URL Input - Must be valid Facebook URL]         │
│                                                        │
│ Competitor 2 * (Required)                             │
│ Name: [Text Input - No restrictions]                  │
│ URL: [URL Input - Must be valid Facebook URL]         │
│                                                        │
│ Competitor 3 * (Required)                             │
│ Name: [Text Input - No restrictions]                  │
│ URL: [URL Input - Must be valid Facebook URL]         │
└─────────────────────────────────────────────────────────┘
```

## Field Requirements

### Account Name Field
- **Type**: Text input
- **Required**: Yes
- **Restrictions**: None
- **Purpose**: Display name for mapping to Facebook URL
- **Example**: "My Brand", "Personal Account", "Business Page"

### Facebook URL Field
- **Type**: URL input
- **Required**: Yes
- **Format**: Must be valid Facebook URL
- **Validation**: `https?://(www\.)?facebook\.com\/([a-zA-Z0-9._%+-]+|profile\.php\?id=\d+)\/?`
- **Purpose**: Actual URL for scraping and analysis
- **Examples**: 
  - `https://facebook.com/yourpage`
  - `https://www.facebook.com/yourprofile`
  - `https://facebook.com/your.business.name`
  - `https://facebook.com/profile.php?id=123456789`
  - `https://www.facebook.com/profile.php?id=100009341018153`

### Competitor Fields
- **Name**: Optional text input (no restrictions)
- **URL**: Required valid Facebook URL
- **First 3**: Required for all competitors
- **Additional**: Optional (up to 10 total)

## Data Structure

### Account Data
```typescript
interface AccountData {
  name: string;    // Display name (no restrictions)
  url: string;     // Facebook URL (validated)
}
```

### Competitor Data
```typescript
interface CompetitorData {
  name: string;    // Display name (no restrictions)
  url: string;     // Facebook URL (validated)
}
```

### Submission Data
```typescript
{
  // New enhanced format
  accountData: {
    name: "User's Display Name",
    url: "https://facebook.com/userpage"
  },
  // Backward compatibility for API
  username: "User's Display Name",
  accountType: "branding" | "non-branding",
  competitors: ["Competitor 1 Name", "Competitor 2 Name", "Competitor 3 Name"], // Array of strings for API compatibility
  postingStyle: "Description of posting style",
  platform: "facebook"
}
```

## Validation Rules

### URL Validation
- Must start with `http://` or `https://`
- Must contain `facebook.com` domain
- Must have valid Facebook page/profile path
- Supports both page URLs and profile URLs with ID parameters
- Examples:
  - Page URLs: `https://facebook.com/YourBusinessPage`
  - Profile URLs: `https://facebook.com/profile.php?id=123456789`

### Required Fields
1. Account Name (no format restrictions)
2. Account URL (valid Facebook URL)
3. Account Type (branding/non-branding)
4. Posting Style (text description)
5. First 3 competitors (both name and URL)

### Optional Fields
- Additional competitors (4-10)
- Competitor names (optional but recommended)

## User Experience

### Clear Instructions
- Account name field: "Can be any name you want to use for this account"
- URL field: "Must be a valid Facebook page or profile URL"
- Competitor fields: "Choose a Facebook page that represents your target market"

### Error Handling
- Real-time URL validation
- Clear error messages for invalid URLs
- Required field indicators
- Critical field warnings

### Confirmation Modal
- Shows all entered data before submission
- Highlights critical fields (URLs)
- Warns about 25-minute processing time
- Allows editing before final submission

## Technical Implementation

### Backward Compatibility
The form maintains backward compatibility with the existing API by sending data in both new and old formats:

- **New Format**: `accountData` object with `name` and `url` fields
- **Old Format**: `username` field for API compatibility
- **Competitors**: Sent as array of strings for API compatibility, with full objects in `competitor_data`

### State Management
```typescript
const [accountData, setAccountData] = useState<AccountData>({ 
  name: '', 
  url: '' 
});

const [competitors, setCompetitors] = useState<CompetitorData[]>([
  { name: '', url: '' },
  { name: '', url: '' },
  { name: '', url: '' }
]);
```

### URL Validation
```typescript
const facebookUrlRegex = /^https?:\/\/(www\.)?facebook\.com\/[a-zA-Z0-9._%+-]+\/?$/;

const validateFacebookUrl = (url: string): boolean => {
  if (!url.trim()) return true; // Empty is valid (optional field)
  return facebookUrlRegex.test(url.trim());
};
```

### Form Validation
```typescript
const isValidForSubmission = (): boolean => {
  // Check basic required fields
  if (!accountData.name.trim() || !accountData.url.trim() || 
      !accountType || !postingStyle.trim()) return false;
  
  // Check URL format validity
  if (!validateFacebookUrl(accountData.url)) return false;
  
  // Check competitors (first 3 are required)
  if (competitors.length < 3) return false;
  if (!competitors.slice(0, 3).every(comp => 
      comp.name.trim() !== '' && comp.url.trim() !== '')) return false;
  if (!competitors.every(comp => 
      !comp.url.trim() || validateFacebookUrl(comp.url))) return false;
  
  return true;
};
```

## Benefits

### For Users
- **Flexibility**: No restrictions on account names
- **Clarity**: Clear distinction between display name and URL
- **Convenience**: Easy to copy-paste Facebook URLs
- **Accuracy**: URL validation prevents errors

### For System
- **Reliability**: Valid URLs ensure successful scraping
- **Mapping**: Names provide context for URLs
- **Scalability**: Supports both pages and profiles
- **Compatibility**: Works with existing processing pipeline

## Migration Notes

### Existing Data
- Previous username-only data will need migration
- New structure supports backward compatibility
- LocalStorage keys updated for new format

### API Changes
- Updated submission endpoint to handle new data structure
- Enhanced validation on server side
- Improved error handling for URL validation

## Support Information

### Facebook URL Examples
- **Pages**: `https://facebook.com/YourBusinessPage`
- **Profiles**: `https://facebook.com/john.doe.123`
- **Profile IDs**: `https://facebook.com/profile.php?id=123456789`
- **Groups**: `https://facebook.com/groups/YourGroupName`

### Common Issues
- **Private Profiles**: Must be public for scraping
- **Invalid URLs**: Must follow Facebook URL format
- **Missing Fields**: All required fields must be completed

### Error Messages
- "Please enter a valid Facebook URL (e.g., https://facebook.com/yourpage or https://facebook.com/profile.php?id=123456789)"
- "Account URL is required"
- "Competitor 1 URL must be a valid Facebook URL (e.g., https://facebook.com/competitor or https://facebook.com/profile.php?id=123456789)"

## Future Enhancements

### Planned Features
- URL preview/validation
- Auto-detection of page type (page vs profile)
- Enhanced competitor suggestions
- Bulk competitor import

### Technical Improvements
- Enhanced URL validation
- Better error handling
- Performance optimizations
- Accessibility improvements
