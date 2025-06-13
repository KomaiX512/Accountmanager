# Pricing and User Access Control System

## Overview

This comprehensive pricing and user access control system provides a sophisticated layered protection mechanism for your account management platform. The system implements three user tiers (Basic, Premium, Admin) with dynamic access control, usage tracking, and seamless upgrade paths.

## Features

### 🎯 User Tiers

1. **Basic (Free Trial)**
   - 3-day free trial
   - 5 instant posts
   - 10 AI discussions
   - 2 days AI reply access
   - Basic goal model (2 days)
   - Basic analytics

2. **Premium ($29/month)**
   - 160 instant posts
   - 200 AI discussions
   - Unlimited AI replies
   - 10 goal model campaigns
   - Auto schedule posts
   - Auto reply with AI
   - Advanced analytics
   - Premium support

3. **Enterprise (Custom)**
   - Unlimited everything
   - Custom integrations
   - Dedicated support
   - Custom analytics
   - White-label options
   - Priority processing
   - Custom AI models
   - SLA guarantee

### 🔐 Admin Access

- Secret admin authentication via URL parameters
- Username: `sentientai`
- Password: `Sentiant123@`
- Admin users bypass all limitations
- Full system access and analytics

## Implementation Architecture

### Frontend Components

#### 1. PricingPage Component
```typescript
// Location: src/components/pricing/PricingPage.tsx
- Modern, responsive pricing cards
- Trial status indicators
- Feature comparisons
- Payment gateway integration ready
```

#### 2. AccessControl Component
```typescript
// Location: src/components/common/AccessControl.tsx
- Feature-based access control
- Upgrade prompts and modals
- Graceful degradation
- Professional UI with animations
```

#### 3. AdminLogin Component
```typescript
// Location: src/components/admin/AdminLogin.tsx
- Secret URL-based activation
- Secure credential validation
- Admin badge for authenticated users
- Professional dark theme
```

### Backend API Endpoints

#### User Management
```javascript
GET    /api/user/:userId           // Get user profile
PUT    /api/user/:userId           // Save/update user profile
```

#### Usage Tracking
```javascript
GET    /api/user/:userId/usage/:period  // Get usage stats
PATCH  /api/user/:userId/usage          // Update usage stats
```

#### Admin Functions
```javascript
GET    /api/admin/analytics        // System analytics
GET    /api/admin/test            // Bucket connectivity test
```

### Data Storage

#### R2 Bucket Structure
```
admin/
├── users/
│   ├── {userId}/
│   │   ├── profile.json           // User profile and subscription
│   │   └── usage/
│   │       └── {YYYY-MM}.json     // Monthly usage stats
└── test/
    └── connectivity.json          // System health test
```

## Usage Guide

### 1. Basic Implementation

#### Wrap Components with Access Control
```tsx
import AccessControl from './components/common/AccessControl';

// Protect post creation feature
<AccessControl feature="posts">
  <PostCreationComponent />
</AccessControl>

// Protect premium features
<AccessControl feature="autoSchedule">
  <AutoScheduleButton />
</AccessControl>
```

#### Track Feature Usage
```tsx
import { useUsageTracking } from './hooks/useUsageTracking';

const MyComponent = () => {
  const { trackPostCreation, trackDiscussion } = useUsageTracking();
  
  const handleCreatePost = async () => {
    // Create post logic
    await createPost();
    
    // Track usage
    trackPostCreation();
  };
};
```

### 2. Admin Access

#### Enable Admin Mode
1. Navigate to: `/?admin=true&key=sentient-access-2024`
2. Enter credentials:
   - Username: `sentientai`
   - Password: `Sentiant123@`
3. User gains admin privileges immediately

#### Check Admin Status
```tsx
import { useAdminStatus, AdminBadge } from './components/admin/AdminLogin';

const MyComponent = () => {
  const { isAdmin, loading } = useAdminStatus();
  
  return (
    <div>
      {isAdmin && <AdminBadge />}
      {isAdmin ? <AdminPanel /> : <UserPanel />}
    </div>
  );
};
```

### 3. User Service Integration

#### Check Access Programmatically
```typescript
import UserService from './services/UserService';

const checkUserAccess = async (userId: string) => {
  const result = await UserService.checkAccess(userId, 'posts');
  
  if (!result.allowed) {
    if (result.upgradeRequired) {
      // Show upgrade prompt
      showUpgradeModal();
    } else {
      // Show error message
      showError(result.reason);
    }
  }
};
```

## Configuration

### Environment Variables
```env
# API Base URL (development)
REACT_APP_API_URL=http://localhost:3002/api

# API Base URL (production)
REACT_APP_API_URL=https://your-domain.com/api
```

### Pricing Plans Configuration
Edit pricing plans in `src/services/UserService.ts`:

```typescript
public readonly PRICING_PLANS: PricingPlan[] = [
  {
    id: 'basic',
    name: 'Basic',
    price: 'Free',
    // ... configuration
  }
  // Add/modify plans here
];
```

## Testing

### Run Comprehensive Tests
```bash
# Install dependencies
npm install axios

# Run test suite
node test-pricing-system.js
```

### Manual Testing Checklist

#### Pricing Page
- [ ] All three tiers display correctly
- [ ] Trial status shows for active users
- [ ] Upgrade buttons work
- [ ] Responsive design on mobile
- [ ] Icons and animations work

#### Access Control
- [ ] Features lock for free users at limits
- [ ] Upgrade modals appear correctly
- [ ] Premium features unlock properly
- [ ] Admin users bypass all restrictions
- [ ] Error handling for edge cases

#### Admin System
- [ ] Secret URL activates admin login
- [ ] Credentials validate correctly
- [ ] Admin badge appears after login
- [ ] Admin analytics work
- [ ] R2 bucket connectivity confirmed

#### Backend API
- [ ] User creation/retrieval works
- [ ] Usage tracking increments properly
- [ ] Trial expiration logic functions
- [ ] Admin bucket operations succeed
- [ ] Error handling for invalid requests

## Security Features

### 1. Admin Protection
- Secret URL parameters required
- Secure credential validation
- Session-based admin status
- No hardcoded admin backdoors

### 2. Data Protection
- R2 bucket encryption at rest
- Secure API endpoints
- Input validation and sanitization
- Error message sanitization

### 3. Access Control
- Client-side and server-side validation
- Graceful degradation for errors
- Rate limiting preparation
- Usage tracking protection

## Payment Gateway Integration

### Preparation for Live Payments

The system is designed to easily integrate with payment gateways. To add live payments:

1. **Choose Payment Provider** (Stripe, PayPal, etc.)
2. **Update PricingPage Component**:
   ```tsx
   const handlePlanSelect = async (planId: string) => {
     // Replace demo logic with actual payment processing
     const paymentResult = await processPayment(planId);
     if (paymentResult.success) {
       await UserService.upgradeUser(userId, planId);
     }
   };
   ```
3. **Add Webhook Handlers** for payment confirmations
4. **Update User Service** with subscription management

### Webhook Example Structure
```javascript
app.post('/api/payment/webhook', async (req, res) => {
  const { userId, planId, paymentStatus } = req.body;
  
  if (paymentStatus === 'completed') {
    await UserService.upgradeUser(userId, planId);
    res.json({ success: true });
  }
});
```

## Monitoring and Analytics

### Built-in Analytics
- User type distribution
- Subscription status tracking
- Usage pattern analysis
- Trial conversion rates

### Access Analytics
```typescript
const analytics = await UserService.getAnalytics();
console.log('Total users:', analytics.totalUsers);
console.log('User types:', analytics.userTypes);
console.log('Subscriptions:', analytics.subscriptionStats);
```

## Troubleshooting

### Common Issues

#### 1. Admin Bucket Connectivity
```bash
# Test bucket connectivity
curl http://localhost:3002/api/admin/test
```

#### 2. User Not Found Errors
- Check R2 bucket permissions
- Verify user ID format
- Ensure proper error handling

#### 3. Trial Expiration Issues
- Verify timezone handling
- Check date calculation logic
- Ensure trial status updates

#### 4. Access Control Not Working
- Check component wrapping
- Verify user authentication
- Ensure proper usage tracking

### Debug Mode
Enable detailed logging by setting:
```javascript
localStorage.setItem('pricing_debug', 'true');
```

## Best Practices

### 1. Component Integration
- Always wrap premium features with `AccessControl`
- Use `useUsageTracking` for all counted features
- Handle loading and error states gracefully

### 2. User Experience
- Show clear upgrade paths
- Provide informative error messages
- Use progressive disclosure for complex features

### 3. Performance
- Cache user data appropriately
- Batch usage tracking updates
- Optimize API calls with debouncing

### 4. Security
- Validate all user inputs
- Sanitize error messages
- Use HTTPS in production
- Regularly rotate admin credentials

## Support and Maintenance

### Regular Tasks
1. **Monthly**: Review usage analytics
2. **Weekly**: Check system health tests
3. **Daily**: Monitor error logs
4. **As needed**: Update pricing plans

### Scaling Considerations
- Implement Redis for user session caching
- Add rate limiting for API endpoints
- Consider CDN for static assets
- Implement proper logging and monitoring

## Conclusion

This pricing and access control system provides a robust foundation for monetizing your account management platform. The system is designed for scalability, security, and excellent user experience while maintaining clean, maintainable code.

For additional support or feature requests, please refer to the system documentation or contact the development team.

---

**Version**: 1.0.0  
**Last Updated**: December 2024  
**Compatibility**: React 18+, Node.js 16+, AWS S3/R2 Compatible Storage 