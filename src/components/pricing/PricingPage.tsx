import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import UserService from '../../services/UserService';
import { PricingPlan, User } from '../../types/user';
import './PricingPage.css';

const PricingPage: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  useEffect(() => {
    const loadUserData = async () => {
      if (currentUser?.uid) {
        try {
          const user = await UserService.getUserData(currentUser.uid);
          setUserData(user);
        } catch (error) {
          console.error('Error loading user data:', error);
        }
      }
      setLoading(false);
    };

    loadUserData();
  }, [currentUser]);

  const handlePlanSelect = async (planId: string) => {
    if (!currentUser?.uid) {
      navigate('/login');
      return;
    }

    setSelectedPlan(planId);

    // For enterprise plan, show contact info
    if (planId === 'enterprise') {
      alert('Please contact us at support@accountmanager.com for enterprise pricing and setup.');
      setSelectedPlan(null);
      return;
    }

    // For now, we'll simulate the upgrade process
    // In production, this would integrate with the payment gateway
    try {
      // TODO: Integrate with payment gateway here
      console.log(`Selected plan: ${planId} for user: ${currentUser.uid}`);
      
      // For demo purposes, show success message
      alert(`Plan ${planId} selected! Payment gateway integration will be added soon.`);
    } catch (error) {
      console.error('Error selecting plan:', error);
      alert('Error selecting plan. Please try again.');
    } finally {
      setSelectedPlan(null);
    }
  };

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case 'basic':
        return '🎯';
      case 'premium':
        return '⭐';
      case 'enterprise':
        return '🏢';
      default:
        return '📦';
    }
  };

  const getFeatureIcon = (feature: string) => {
    if (feature.includes('Unlimited')) return '♾️';
    if (feature.includes('Auto')) return '🤖';
    if (feature.includes('AI')) return '🧠';
    if (feature.includes('Analytics')) return '📊';
    if (feature.includes('Support')) return '🛟';
    if (feature.includes('Posts')) return '📝';
    if (feature.includes('Discussions')) return '💬';
    if (feature.includes('Campaigns')) return '🎯';
    if (feature.includes('Custom')) return '⚙️';
    if (feature.includes('Priority')) return '⚡';
    if (feature.includes('White-label')) return '🏷️';
    if (feature.includes('SLA')) return '🛡️';
    return '✓';
  };

  const currentPlan = userData?.subscription?.planId;
  const isTrialActive = userData?.isTrialActive;
  const trialDaysRemaining = userData?.subscription?.trialDaysRemaining;

  if (loading) {
    return (
      <div className="pricing-page">
        <div className="pricing-banner">
          <h2>Loading Pricing Plans</h2>
        </div>
        
        <div className="pricing-wrapper">
          <div className="pricing-loading">
            <div className="loading-spinner"></div>
            <p>Loading pricing information...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pricing-page">
      <div className="pricing-banner">
        <h2>Welcome to Our Pricing Plans</h2>
      </div>
      
      <div className="pricing-wrapper">
        <div className="pricing-header">
          <h1>Choose Your Plan</h1>
          <p>Unlock the full potential of AI-powered social media management</p>
          
          {isTrialActive && trialDaysRemaining && (
            <div className="trial-badge">
              <span className="trial-icon">⏰</span>
              <span>{trialDaysRemaining} days left in your free trial</span>
            </div>
          )}
        </div>

      <div className="pricing-container">
        {UserService.PRICING_PLANS.map((plan: PricingPlan) => (
          <div 
            key={plan.id}
            className={`pricing-card ${plan.popular ? 'popular' : ''} ${currentPlan === plan.id ? 'current' : ''}`}
          >
            {plan.popular && <div className="popular-badge">Most Popular</div>}
            {currentPlan === plan.id && <div className="current-badge">Current Plan</div>}
            
            <div className="plan-header">
              <div className="plan-icon">{getPlanIcon(plan.id)}</div>
              <h3>{plan.name}</h3>
              <div className="plan-price">
                <span className="price">{plan.price}</span>
                <span className="period">{plan.period}</span>
              </div>
              <p className="plan-description">{plan.description}</p>
            </div>

            <div className="plan-features">
              <h4>What's included:</h4>
              <ul>
                {plan.features.map((feature, index) => (
                  <li key={index}>
                    <span className="feature-icon">{getFeatureIcon(feature)}</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="plan-action">
              {plan.contactUs ? (
                <button 
                  className="btn-contact"
                  onClick={() => handlePlanSelect(plan.id)}
                >
                  Contact Sales
                </button>
              ) : currentPlan === plan.id ? (
                <button className="btn-current" disabled>
                  Current Plan
                </button>
              ) : (
                <button 
                  className={`btn-select ${plan.popular ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handlePlanSelect(plan.id)}
                  disabled={selectedPlan === plan.id}
                >
                  {selectedPlan === plan.id ? (
                    <>
                      <span className="btn-spinner"></span>
                      Processing...
                    </>
                  ) : plan.id === 'basic' ? (
                    'Start Free Trial'
                  ) : (
                    'Upgrade Now'
                  )}
                </button>
              )}
            </div>

            {plan.trialDays && (
              <div className="trial-info">
                <small>🎁 {plan.trialDays}-day free trial included</small>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="pricing-faq">
        <h2>Frequently Asked Questions</h2>
        <div className="faq-grid">
          <div className="faq-item">
            <h3>Can I change my plan anytime?</h3>
            <p>Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.</p>
          </div>
          <div className="faq-item">
            <h3>What happens after my trial ends?</h3>
            <p>Your account will be automatically converted to a free plan with limited features unless you upgrade.</p>
          </div>
          <div className="faq-item">
            <h3>Do you offer refunds?</h3>
            <p>Yes, we offer a 30-day money-back guarantee for all paid plans.</p>
          </div>
          <div className="faq-item">
            <h3>Is my data secure?</h3>
            <p>Absolutely. We use enterprise-grade security and encryption to protect your data.</p>
          </div>
        </div>
      </div>

        <div className="pricing-footer">
          <p>Need help choosing? <a href="mailto:support@accountmanager.com">Contact our team</a></p>
        </div>
      </div>
    </div>
  );
};

export default PricingPage; 