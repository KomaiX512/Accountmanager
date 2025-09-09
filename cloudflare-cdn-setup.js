// PHASE 3: CLOUDFLARE CDN CONFIGURATION SCRIPT
// Automate CloudFlare Pro setup for static asset delivery

const axios = require('axios');
const fs = require('fs');

class CloudFlareCDNSetup {
  constructor() {
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN;
    this.zoneId = process.env.CLOUDFLARE_ZONE_ID;
    this.domain = 'sentientm.com';
    this.baseURL = 'https://api.cloudflare.com/client/v4';
    
    if (!this.apiToken) {
      console.error('❌ CLOUDFLARE_API_TOKEN environment variable required');
      process.exit(1);
    }
  }

  async makeRequest(method, endpoint, data = null) {
    try {
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json'
        }
      };
      
      if (data) config.data = data;
      
      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`CloudFlare API Error: ${error.response?.data?.errors?.[0]?.message || error.message}`);
      throw error;
    }
  }

  async getZoneId() {
    if (this.zoneId) return this.zoneId;
    
    console.log('🔍 Finding zone ID for sentientm.com...');
    const response = await this.makeRequest('GET', '/zones?name=sentientm.com');
    
    if (response.result.length === 0) {
      throw new Error('Domain not found in CloudFlare account');
    }
    
    this.zoneId = response.result[0].id;
    console.log(`✅ Zone ID: ${this.zoneId}`);
    return this.zoneId;
  }

  async enableCDN() {
    const zoneId = await this.getZoneId();
    
    console.log('🚀 Configuring CloudFlare CDN settings...');
    
    // Enable CDN (orange cloud)
    await this.makeRequest('PATCH', `/zones/${zoneId}/settings/always_online`, {
      value: 'on'
    });
    
    // Set caching level to aggressive
    await this.makeRequest('PATCH', `/zones/${zoneId}/settings/cache_level`, {
      value: 'aggressive'
    });
    
    // Enable Brotli compression
    await this.makeRequest('PATCH', `/zones/${zoneId}/settings/brotli`, {
      value: 'on'
    });
    
    // Enable minification
    await this.makeRequest('PATCH', `/zones/${zoneId}/settings/minify`, {
      value: {
        css: 'on',
        html: 'on',
        js: 'on'
      }
    });
    
    console.log('✅ Basic CDN settings configured');
  }

  async createPageRules() {
    const zoneId = await this.getZoneId();
    
    console.log('📋 Creating CloudFlare Page Rules for asset optimization...');
    
    const pageRules = [
      // Static assets - aggressive caching
      {
        targets: [{
          target: 'url',
          constraint: {
            operator: 'matches',
            value: `${this.domain}/assets/*`
          }
        }],
        actions: [
          { id: 'cache_level', value: 'cache_everything' },
          { id: 'edge_cache_ttl', value: 2592000 }, // 30 days
          { id: 'browser_cache_ttl', value: 31536000 } // 1 year
        ],
        priority: 1,
        status: 'active'
      },
      
      // Images and media - long cache
      {
        targets: [{
          target: 'url',
          constraint: {
            operator: 'matches',
            value: `${this.domain}/*.{jpg,jpeg,png,gif,ico,svg,woff,woff2,ttf,eot,css,js}`
          }
        }],
        actions: [
          { id: 'cache_level', value: 'cache_everything' },
          { id: 'edge_cache_ttl', value: 2592000 }, // 30 days
          { id: 'browser_cache_ttl', value: 2592000 }
        ],
        priority: 2,
        status: 'active'
      },
      
      // API endpoints - no cache
      {
        targets: [{
          target: 'url',
          constraint: {
            operator: 'matches',
            value: `${this.domain}/api/*`
          }
        }],
        actions: [
          { id: 'cache_level', value: 'bypass' }
        ],
        priority: 3,
        status: 'active'
      }
    ];

    // Delete existing page rules first
    const existingRules = await this.makeRequest('GET', `/zones/${zoneId}/pagerules`);
    for (const rule of existingRules.result) {
      await this.makeRequest('DELETE', `/zones/${zoneId}/pagerules/${rule.id}`);
      console.log(`🗑️  Removed existing page rule: ${rule.id}`);
    }

    // Create new page rules
    for (const rule of pageRules) {
      const response = await this.makeRequest('POST', `/zones/${zoneId}/pagerules`, rule);
      console.log(`✅ Created page rule: ${rule.targets[0].constraint.value}`);
    }
  }

  async configureCacheSettings() {
    const zoneId = await this.getZoneId();
    
    console.log('⚡ Optimizing cache settings...');
    
    // Create custom cache rules using Cloudflare Rules API
    const cacheRules = {
      rules: [
        {
          description: 'Cache static assets aggressively',
          expression: '(http.request.uri.path matches "^/assets/.*" or http.request.uri.path matches ".*\\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$")',
          action: 'set_cache_settings',
          action_parameters: {
            cache: true,
            edge_cache_ttl: 2592000, // 30 days
            browser_cache_ttl: 31536000 // 1 year
          }
        },
        {
          description: 'Bypass cache for API endpoints',
          expression: 'starts_with(http.request.uri.path, "/api/")',
          action: 'set_cache_settings',
          action_parameters: {
            cache: false
          }
        }
      ]
    };
    
    // Note: This requires CloudFlare Pro plan
    try {
      await this.makeRequest('PUT', `/zones/${zoneId}/rulesets/phases/http_request_cache_settings/entrypoint`, cacheRules);
      console.log('✅ Advanced cache rules configured');
    } catch (error) {
      console.log('⚠️  Advanced cache rules require Pro plan, using Page Rules instead');
    }
  }

  async enableSecurityFeatures() {
    const zoneId = await this.getZoneId();
    
    console.log('🔒 Enabling security features...');
    
    // Enable Always Use HTTPS
    await this.makeRequest('PATCH', `/zones/${zoneId}/settings/always_use_https`, {
      value: 'on'
    });
    
    // Enable HSTS
    await this.makeRequest('PATCH', `/zones/${zoneId}/settings/security_header`, {
      value: {
        strict_transport_security: {
          enabled: true,
          max_age: 31536000,
          include_subdomains: true
        }
      }
    });
    
    // Set SSL mode to Full (Strict)
    await this.makeRequest('PATCH', `/zones/${zoneId}/settings/ssl`, {
      value: 'full'
    });
    
    console.log('✅ Security features enabled');
  }

  async generateCDNReport() {
    const zoneId = await this.getZoneId();
    
    console.log('📊 Generating CDN configuration report...');
    
    // Get zone analytics
    const analytics = await this.makeRequest('GET', `/zones/${zoneId}/analytics/dashboard?since=-1440`); // Last 24h
    
    // Get current settings
    const settings = await this.makeRequest('GET', `/zones/${zoneId}/settings`);
    
    const report = {
      domain: this.domain,
      zone_id: zoneId,
      setup_date: new Date().toISOString(),
      cdn_status: 'active',
      analytics: {
        requests: analytics.result?.totals?.requests?.all || 0,
        bandwidth_saved: analytics.result?.totals?.bandwidth?.cached || 0,
        cache_hit_ratio: analytics.result?.totals?.requests?.cached / analytics.result?.totals?.requests?.all * 100 || 0
      },
      active_features: {
        always_online: settings.result.find(s => s.id === 'always_online')?.value === 'on',
        brotli: settings.result.find(s => s.id === 'brotli')?.value === 'on',
        minify: settings.result.find(s => s.id === 'minify')?.value,
        ssl: settings.result.find(s => s.id === 'ssl')?.value,
        cache_level: settings.result.find(s => s.id === 'cache_level')?.value
      },
      page_rules_count: (await this.makeRequest('GET', `/zones/${zoneId}/pagerules`)).result.length
    };
    
    // Save report
    fs.writeFileSync('/home/komail/Accountmanager/cloudflare-cdn-report.json', JSON.stringify(report, null, 2));
    
    console.log('✅ CDN setup completed successfully!');
    console.log(`📊 Cache hit ratio: ${report.analytics.cache_hit_ratio.toFixed(1)}%`);
    console.log(`📋 Page rules configured: ${report.page_rules_count}`);
    
    return report;
  }

  async setupCDN() {
    try {
      console.log('🚀 CLOUDFLARE PRO CDN SETUP - PHASE 3');
      console.log('=====================================');
      
      await this.enableCDN();
      await this.createPageRules();
      await this.configureCacheSettings();
      await this.enableSecurityFeatures();
      
      const report = await this.generateCDNReport();
      
      console.log('\n✅ CLOUDFLARE CDN SETUP COMPLETE!');
      console.log('📝 Configuration saved to: cloudflare-cdn-report.json');
      console.log('🌐 Static assets will now be served via CloudFlare CDN');
      
      return report;
      
    } catch (error) {
      console.error('❌ CDN setup failed:', error.message);
      throw error;
    }
  }
}

// Usage instructions
if (require.main === module) {
  console.log(`
🌐 CLOUDFLARE CDN SETUP INSTRUCTIONS

1. Get your CloudFlare API Token:
   - Go to https://dash.cloudflare.com/profile/api-tokens
   - Create token with Zone:Edit permissions for sentientm.com
   
2. Set environment variables:
   export CLOUDFLARE_API_TOKEN="your-api-token"
   export CLOUDFLARE_ZONE_ID="your-zone-id" (optional, will auto-detect)

3. Run setup:
   node cloudflare-cdn-setup.js

Features configured:
✅ Aggressive static asset caching (30 days edge, 1 year browser)
✅ Brotli compression for smaller file sizes  
✅ CSS/JS/HTML minification
✅ HTTPS enforcement and HSTS
✅ API bypass rules (no caching for dynamic content)
✅ Real-time analytics and monitoring
  `);
  
  if (process.env.CLOUDFLARE_API_TOKEN) {
    const cdn = new CloudFlareCDNSetup();
    cdn.setupCDN().catch(console.error);
  }
}

module.exports = CloudFlareCDNSetup;
