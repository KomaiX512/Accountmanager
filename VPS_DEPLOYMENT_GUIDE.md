# 🚀 VPS DEPLOYMENT GUIDE - ASSET SERVING FIX

## 🚨 **IMMEDIATE ISSUES TO FIX:**

1. **JavaScript Error**: `ga-cookie-fix.js` constant variable assignment error
2. **404 Asset Errors**: CSS/JS files not accessible
3. **Nginx Configuration**: Missing proper Vite asset handling

## 🔧 **STEP-BY-STEP FIX:**

### **Step 1: Fix ga-cookie-fix.js Error**
```bash
# On your VPS, replace the problematic file
sudo cp /path/to/fixed/ga-cookie-fix.js /var/www/sentientm/Accountmanager/dist/
```

### **Step 2: Update Nginx Configuration**
```bash
# Backup current config
sudo cp /etc/nginx/sites-enabled/sentientm /etc/nginx/sites-enabled/sentientm.backup

# Copy the fixed VPS.conf
sudo cp VPS.conf /etc/nginx/sites-enabled/sentientm

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

### **Step 3: Deploy Latest Build Files**
```bash
# Backup current dist
sudo cp -r /var/www/sentientm/Accountmanager/dist /var/www/sentientm/Accountmanager/dist.backup

# Deploy new build
sudo cp -r dist/* /var/www/sentientm/Accountmanager/dist/

# Set permissions
sudo chown -R www-data:www-data /var/www/sentientm/Accountmanager/dist/
sudo chmod -R 755 /var/www/sentientm/Accountmanager/dist/
```

### **Step 4: Verify Asset Accessibility**
```bash
# Test main page
curl -I https://sentientm.com/

# Test CSS file
curl -I https://sentientm.com/assets/index-C573772T.css

# Test JS file
curl -I https://sentientm.com/assets/index-A0Ly_dQ9.js

# Test manifest
curl -I https://sentientm.com/manifest.json
```

## 📁 **CRITICAL VPS PATHS:**

- **Nginx Config**: `/etc/nginx/sites-enabled/sentientm`
- **Web Root**: `/var/www/sentientm/Accountmanager/dist/`
- **Nginx Logs**: `/var/log/nginx/sentientm.error.log`

## 🔍 **TROUBLESHOOTING:**

### **If Assets Still 404:**
1. Check nginx error logs: `sudo tail -f /var/log/nginx/sentientm.error.log`
2. Verify file permissions: `ls -la /var/www/sentientm/Accountmanager/dist/assets/`
3. Test nginx config: `sudo nginx -t`
4. Restart nginx: `sudo systemctl restart nginx`

### **If JavaScript Errors Persist:**
1. Check browser console for specific error messages
2. Verify `ga-cookie-fix.js` is properly deployed
3. Clear browser cache and reload

### **If Pages Don't Render:**
1. Check if `index.html` is accessible
2. Verify SPA fallback is working
3. Check nginx access logs: `sudo tail -f /var/log/nginx/sentientm.access.log`

## ✅ **VERIFICATION CHECKLIST:**

- [ ] VPS.conf updated and nginx reloaded
- [ ] Latest build files deployed to `/var/www/sentientm/Accountmanager/dist/`
- [ ] Fixed `ga-cookie-fix.js` deployed
- [ ] Assets accessible via HTTPS (no 404 errors)
- [ ] Pricing and Auth pages render correctly
- [ ] No JavaScript errors in browser console
- [ ] Nginx configuration valid (`sudo nginx -t`)

## 🚀 **QUICK DEPLOYMENT COMMANDS:**

```bash
# Run the automated deployment script
./deploy-to-vps.sh

# Or manually:
sudo cp VPS.conf /etc/nginx/sites-enabled/sentientm
sudo nginx -t && sudo systemctl reload nginx
sudo cp -r dist/* /var/www/sentientm/Accountmanager/dist/
sudo chown -R www-data:www-data /var/www/sentientm/Accountmanager/dist/
```

## 📊 **MONITORING:**

```bash
# Watch nginx error logs
sudo tail -f /var/log/nginx/sentientm.error.log

# Watch nginx access logs
sudo tail -f /var/log/nginx/sentientm.access.log

# Check nginx status
sudo systemctl status nginx

# Check disk space
df -h /var/www/sentientm/Accountmanager/
```

## 🎯 **EXPECTED RESULTS:**

After deployment:
- ✅ No more 404 errors for CSS/JS files
- ✅ No more JavaScript constant variable errors
- ✅ Pricing page renders with proper styling
- ✅ Authentication pages work correctly
- ✅ All Vite assets load successfully
- ✅ SPA routing works properly

## 🆘 **EMERGENCY ROLLBACK:**

If something goes wrong:
```bash
# Restore nginx config
sudo cp /etc/nginx/sites-enabled/sentientm.backup /etc/nginx/sites-enabled/sentientm

# Restore web files
sudo cp -r /var/www/sentientm/Accountmanager/dist.backup/* /var/www/sentientm/Accountmanager/dist/

# Reload nginx
sudo systemctl reload nginx
```
