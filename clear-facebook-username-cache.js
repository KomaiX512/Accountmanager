// Clear Facebook username cache script

console.log('Clearing Facebook username cache...');

// You can run this in the browser console to clear cached values
// localStorage.removeItem('facebook_username_' + 'YOUR_USER_ID');
// localStorage.setItem('facebook_username_' + 'YOUR_USER_ID', 'AutoPulseGlobalTrading');

// Or programmatically for testing:
const clearFacebookCache = () => {
  const keys = Object.keys(localStorage);
  const facebookUsernameKeys = keys.filter(key => key.includes('facebook_username_'));
  
  facebookUsernameKeys.forEach(key => {
    const oldValue = localStorage.getItem(key);
    console.log(`Updating ${key}: "${oldValue}" -> "AutoPulseGlobalTrading"`);
    localStorage.setItem(key, 'AutoPulseGlobalTrading');
  });
  
  console.log('Facebook username cache updated!');
  console.log('Please refresh the page to see the changes.');
};

// Export for use in browser
if (typeof window !== 'undefined') {
  window.clearFacebookCache = clearFacebookCache;
}

module.exports = { clearFacebookCache };
