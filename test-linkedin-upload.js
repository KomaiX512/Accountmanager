const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');

// Configure S3 client for Cloudflare R2
const s3Client = new S3Client({
  region: 'auto',
  endpoint: 'https://a64ca76b6c474057b192857eb594baf4.r2.cloudflarestorage.com',
  credentials: {
    accessKeyId: 'a64ca76b6c474057b192857eb594baf4',
    secretAccessKey: 'a64ca76b6c474057b192857eb594baf4'
  }
});

async function uploadLinkedInProfile() {
  try {
    // Read the local cache file
    const profileData = JSON.parse(fs.readFileSync('data/cache/linkedin_zia_profile.json', 'utf8'));
    
    // Extract the profileInfo from the nested structure
    const profileInfo = profileData.data.profileInfo;
    
    // Transform to the expected format
    const transformedProfile = {
      username: 'zia',
      fullName: profileInfo.fullName,
      biography: profileInfo.about || profileInfo.headline || '',
      followersCount: profileInfo.followers || 0,
      followsCount: profileInfo.connections || 0,
      postsCount: 0,
      profilePicUrl: profileInfo.profilePic || '',
      profilePicUrlHD: profileInfo.profilePicHighQuality || profileInfo.profilePic || '',
      verified: false,
      private: false,
      platform: 'linkedin',
      extractedAt: new Date().toISOString(),
      // LinkedIn-specific fields
      linkedinUrl: profileInfo.linkedinUrl,
      headline: profileInfo.headline,
      jobTitle: profileInfo.jobTitle,
      companyName: profileInfo.companyName,
      companyIndustry: profileInfo.companyIndustry,
      addressWithCountry: profileInfo.addressWithCountry,
      topSkillsByEndorsements: profileInfo.topSkillsByEndorsements
    };
    
    // Upload to R2 using the correct key format
    const key = 'ProfileInfo/linkedin/zia/profile.json';
    
    const putCommand = new PutObjectCommand({
      Bucket: 'tasks',
      Key: key,
      Body: JSON.stringify(transformedProfile, null, 2),
      ContentType: 'application/json'
    });
    
    await s3Client.send(putCommand);
    
    console.log(`✅ LinkedIn profile uploaded successfully: ${key}`);
    console.log('Profile data:', JSON.stringify(transformedProfile, null, 2));
    
  } catch (error) {
    console.error('❌ Error uploading LinkedIn profile:', error);
  }
}

uploadLinkedInProfile();
