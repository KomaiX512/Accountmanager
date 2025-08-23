# PWA Setup Guide for Sentient Marketing

Your website has been converted to a Progressive Web App (PWA) that can be installed on mobile devices!

## What's Been Added

1. **`public/manifest.json`** - Defines your app's appearance and behavior
2. **`public/service-worker.js`** - Handles caching and offline functionality  
3. **`public/pwa-register.js`** - Manages PWA installation and registration
4. **Updated `index.html`** - Added PWA meta tags and manifest links
5. **`scripts/generate-pwa-icons.js`** - Script to generate required icon sizes

## Quick Setup

### 1. Generate PWA Icons (Two Options)

#### Option A: Simple Setup (No Dependencies)
```bash
node scripts/simple-pwa-setup.js
```
This creates basic icons from your existing logo without additional software.

#### Option B: High-Quality Icons (Requires ImageMagick)
First, install ImageMagick:
```bash
# Ubuntu/Debian
sudo apt-get install imagemagick

# macOS
brew install imagemagick

# Windows: Download from https://imagemagick.org/
```

Then run the high-quality icon generator:
```bash
node scripts/generate-pwa-icons.js
```

Both options will create icons in `public/icons/` from your existing `Logo/logo.png`.

### 2. Test Your PWA

1. **Build and serve your app** (make sure it's accessible via HTTPS)
2. **Open on mobile device** or use Chrome DevTools mobile emulation
3. **Look for the install prompt** - it should appear automatically
4. **Install the app** - it will appear on your home screen

## PWA Features

- ✅ **Installable** - Shows "Add to Home Screen" prompt
- ✅ **Standalone Mode** - Opens in fullscreen without browser UI
- ✅ **Offline Support** - Caches resources for offline use
- ✅ **App-like Experience** - Native app feel on mobile
- ✅ **Responsive Icons** - Multiple sizes for different devices

## Testing

### Chrome DevTools (Desktop)
1. Open DevTools (F12)
2. Go to Application tab
3. Check "Manifest" and "Service Workers" sections
4. Use "Install" button in Application tab

### Mobile Testing
1. Open your site on a mobile device
2. Look for the browser's install prompt
3. Install and test the standalone mode
4. Verify offline functionality

## Customization

### Manifest Settings
Edit `public/manifest.json` to customize:
- App name and description
- Colors and theme
- Display mode (standalone, fullscreen, minimal-ui)
- Orientation preferences

### Service Worker
Modify `public/service-worker.js` to:
- Change caching strategy
- Add offline fallback pages
- Implement background sync
- Handle push notifications

## Troubleshooting

### Install Prompt Not Showing
- Ensure HTTPS is enabled
- Check manifest.json is valid
- Verify service worker is registered
- Clear browser cache and try again

### Icons Not Loading
- Run the icon generator script
- Check icon paths in manifest.json
- Ensure icons are in public/icons/ directory

### Service Worker Issues
- Check browser console for errors
- Verify service-worker.js is accessible
- Clear browser cache and reload

## Browser Support

- ✅ Chrome/Edge (Android/Desktop)
- ✅ Safari (iOS 11.3+)
- ✅ Firefox (Android/Desktop)
- ⚠️ Safari (macOS) - Limited support

## Next Steps

1. **Test thoroughly** on different devices and browsers
2. **Customize the manifest** to match your brand
3. **Add offline fallback pages** for better UX
4. **Implement push notifications** if needed
5. **Monitor PWA analytics** in your analytics platform

Your PWA is now ready! Users can install it on their mobile devices and enjoy a native app-like experience. 🎉
