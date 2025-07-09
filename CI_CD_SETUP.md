# SentientM Account Manager - CI/CD Pipeline Setup

This document provides a comprehensive guide for setting up and using the automated CI/CD pipeline for the SentientM Account Manager project.

## 🏗️ Architecture Overview

### Deployment Strategy: Symlink-Based Switching

**CRITICAL CONSTRAINT**: Both staging and production use the same ports (3000, 3001, 3002) to avoid refactoring 3000+ endpoint references.

### Deployment Structure
```
/var/www/sentientm/
├── Accountmanager/          # Production deployment
├── Accountmanager-staging/  # Staging deployment
├── Accountmanager-current/  # Symlink target (switches between staging/production)
├── Accountmanager-backup/   # Production backups
└── logs/                   # Centralized logs
```

### Port Configuration (Same for Both Environments)
| Service | Port | Purpose |
|---------|------|---------|
| Main Server | 3000 | API endpoints |
| RAG Server | 3001 | AI/RAG functionality |
| Proxy Server | 3002 | Frontend proxy |

### Domain-Based Routing
- **Production**: https://sentientm.com
- **Staging**: https://staging.sentientm.com
- **Both use the same ports**, differentiated by domain

### Branch Strategy
- **`staging`** → Staging deployment (https://staging.sentientm.com)
- **`main`** → Production deployment (https://sentientm.com)

## 🚀 Quick Start

### 1. VPS Setup

Run the setup script on your VPS:

```bash
# SSH into your VPS
ssh root@209.74.66.135

# Download and run the setup script
curl -fsSL https://raw.githubusercontent.com/KomaiX512/Accountmanager/main/scripts/setup-cicd.sh | bash
```

### 2. GitHub Repository Configuration

Add the following secrets to your GitHub repository:

1. Go to your repository → Settings → Secrets and variables → Actions
2. Add the following repository secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `VPS_HOST` | `209.74.66.135` | VPS IP address |
| `VPS_USER` | `root` | SSH username |
| `VPS_SSH_KEY` | Your private SSH key | SSH private key for deployment |
| `VPS_PORT` | `22` | SSH port (optional) |

### 3. SSL Certificate Setup

Configure SSL certificates for your domains:

```bash
# Install Certbot
apt install certbot python3-certbot-nginx

# Get SSL certificates
certbot --nginx -d sentientm.com -d www.sentientm.com
certbot --nginx -d staging.sentientm.com
```

### 4. Environment Variables

Create environment files for each environment:

```bash
# Production environment
cp /var/www/sentientm/.env.template /var/www/sentientm/Accountmanager/.env.production

# Staging environment
cp /var/www/sentientm/.env.template /var/www/sentientm/Accountmanager-staging/.env.staging
```

Edit the environment files with your specific configuration.

## 🔄 Deployment Workflows

### Staging Deployment

**Trigger:** Push to `staging` branch

**Process:**
1. Runs tests and linting
2. Builds the application
3. Creates deployment package
4. Uploads to VPS
5. Deploys to staging environment
6. Performs health checks
7. **Switches symlink to staging**
8. Rolls back on failure

**Access:** https://staging.sentientm.com

### Production Deployment

**Trigger:** Push to `main` branch

**Process:**
1. Runs tests and linting
2. Builds the application
3. Creates deployment package
4. Uploads to VPS
5. Deploys with zero downtime:
   - Starts new processes
   - Health checks new deployment
   - Stops old processes
   - **Switches symlink to production**
6. Creates automatic backups
7. Rolls back on failure

**Access:** https://sentientm.com

## 🛠️ Manual Operations

### Health Checks

```bash
# Check all services
/var/www/sentientm/health-check.sh

# Check specific services (same ports for both environments)
curl -f http://localhost:3000/health  # Main server
curl -f http://localhost:3001/health  # RAG server
curl -f http://localhost:3002/health  # Proxy server
```

### Manual Deployment

```bash
# Production deployment
/var/www/sentientm/deploy-production.sh

# Staging deployment
/var/www/sentientm/deploy-staging.sh
```

### Symlink Management

```bash
# Check current symlink
ls -la /var/www/sentientm/Accountmanager-current

# Switch to staging
ln -sfn /var/www/sentientm/Accountmanager-staging /var/www/sentientm/Accountmanager-current

# Switch to production
ln -sfn /var/www/sentientm/Accountmanager /var/www/sentientm/Accountmanager-current

# Restart services after symlink change
pm2 restart all
```

### Rollback

```bash
# Rollback to previous production deployment
/var/www/sentientm/rollback.sh
```

### Monitoring

```bash
# System monitoring
/var/www/sentientm/monitor.sh

# PM2 status
pm2 status

# View logs
pm2 logs
```

## 📊 Monitoring and Logs

### Log Locations

```
/var/www/sentientm/Accountmanager/logs/
├── production-main-server-combined.log
├── production-main-server-out.log
├── production-main-server-error.log
├── production-rag-server-combined.log
├── production-rag-server-out.log
├── production-rag-server-error.log
├── production-proxy-server-combined.log
├── production-proxy-server-out.log
└── production-proxy-server-error.log
```

### PM2 Commands

```bash
# View all processes
pm2 status

# View logs
pm2 logs

# Restart all processes
pm2 restart all

# Stop all processes
pm2 stop all

# Monitor processes
pm2 monit
```

## 🔧 Troubleshooting

### Common Issues

#### 1. Deployment Fails

**Symptoms:** GitHub Actions workflow fails

**Solutions:**
- Check VPS connectivity: `ssh root@209.74.66.135`
- Verify SSH key permissions: `chmod 600 ~/.ssh/id_rsa`
- Check disk space: `df -h`
- Review logs: `pm2 logs`

#### 2. Health Check Fails

**Symptoms:** Services not responding

**Solutions:**
- Check if processes are running: `pm2 status`
- Restart processes: `pm2 restart all`
- Check port conflicts: `netstat -tlnp | grep :3000`
- Review error logs: `tail -f /var/www/sentientm/Accountmanager/logs/*-error.log`

#### 3. Symlink Issues

**Symptoms:** Wrong environment is active

**Solutions:**
- Check current symlink: `ls -la /var/www/sentientm/Accountmanager-current`
- Switch symlink: `ln -sfn /path/to/correct/deployment /var/www/sentientm/Accountmanager-current`
- Restart services: `pm2 restart all`

#### 4. SSL Certificate Issues

**Symptoms:** HTTPS not working

**Solutions:**
- Check certificate status: `certbot certificates`
- Renew certificates: `certbot renew`
- Check nginx configuration: `nginx -t`
- Restart nginx: `systemctl restart nginx`

### Debug Commands

```bash
# Check system resources
htop

# Check disk usage
df -h

# Check memory usage
free -h

# Check network connections
netstat -tlnp

# Check nginx status
systemctl status nginx

# Check PM2 status
pm2 status

# View recent logs
tail -f /var/www/sentientm/Accountmanager/logs/*-combined.log

# Check current deployment
readlink -f /var/www/sentientm/Accountmanager-current
```

## 🔒 Security Considerations

### Firewall Configuration

The setup script configures UFW firewall with:
- SSH access (port 22)
- HTTP access (port 80)
- HTTPS access (port 443)

### SSL/TLS

- Configure SSL certificates for both production and staging
- Use strong cipher suites
- Enable HSTS headers

### Access Control

- Use SSH keys instead of passwords
- Limit SSH access to specific IPs if possible
- Regular security updates

## 📈 Performance Optimization

### PM2 Configuration

The deployment uses PM2 with:
- Process monitoring and auto-restart
- Memory limits (2GB for main/RAG, 1GB for proxy)
- Log rotation
- Graceful shutdown handling

### Nginx Optimization

- HTTP/2 support
- Gzip compression
- Proxy buffering
- Connection pooling

### Monitoring

- System resource monitoring
- Application health checks
- Log rotation and retention
- Automatic backup management

## 🔄 Backup and Recovery

### Automatic Backups

- Production deployments create automatic backups
- Backups are stored in `/var/www/sentientm/Accountmanager-backup/`
- Last 3 backups are retained
- Backup naming: `Accountmanager-backup.YYYYMMDD_HHMMSS`

### Manual Backup

```bash
# Create manual backup
cp -r /var/www/sentientm/Accountmanager /var/www/sentientm/Accountmanager-backup/manual-$(date +%Y%m%d_%H%M%S)
```

### Recovery

```bash
# Restore from backup
/var/www/sentientm/rollback.sh

# Or manually restore
pm2 stop all
rm -rf /var/www/sentientm/Accountmanager
cp -r /var/www/sentientm/Accountmanager-backup/[backup-name] /var/www/sentientm/Accountmanager
cd /var/www/sentientm/Accountmanager
pm2 start ecosystem.config.js --env production
ln -sfn /var/www/sentientm/Accountmanager /var/www/sentientm/Accountmanager-current
```

## 📝 Environment Variables

### Required Environment Variables

Create `.env.production` and `.env.staging` files with:

```bash
# Server Configuration (same for both environments)
NODE_ENV=production
MAIN_SERVER_PORT=3000
RAG_SERVER_PORT=3001
PROXY_SERVER_PORT=3002

# AWS/R2 Configuration
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=auto
R2_ENDPOINT=https://your-endpoint.r2.cloudflarestorage.com

# Social Media API Keys
INSTAGRAM_CLIENT_ID=your_instagram_client_id
INSTAGRAM_CLIENT_SECRET=your_instagram_client_secret
FACEBOOK_APP_ID=your_facebook_app_id
FACEBOOK_APP_SECRET=your_facebook_app_secret
TWITTER_API_KEY=your_twitter_api_key
TWITTER_API_SECRET=your_twitter_api_secret

# Email Configuration
SMTP_HOST=your_smtp_host
SMTP_PORT=587
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
```

## 🚀 Next Steps

1. **Configure SSL certificates** for both domains
2. **Set up environment variables** for production and staging
3. **Test staging deployment** by pushing to staging branch
4. **Test production deployment** by pushing to main branch
5. **Set up monitoring** and alerting
6. **Configure log aggregation** if needed
7. **Set up automated backups** to external storage

## 📞 Support

For issues with the CI/CD pipeline:

1. Check the GitHub Actions logs
2. Review the VPS logs: `/var/www/sentientm/Accountmanager/logs/`
3. Use the health check script: `/var/www/sentientm/health-check.sh`
4. Check system resources: `/var/www/sentientm/monitor.sh`

## 📋 Checklist

- [ ] VPS setup script executed
- [ ] GitHub repository secrets configured
- [ ] SSL certificates installed
- [ ] Environment variables configured
- [ ] Staging deployment tested
- [ ] Production deployment tested
- [ ] Monitoring configured
- [ ] Backup strategy verified
- [ ] Security measures implemented
- [ ] Documentation updated 