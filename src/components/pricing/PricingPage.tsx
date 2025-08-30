import React from 'react';
import './PricingPage.css';

const PricingPage: React.FC = () => {
  return (
    <div className="pricing-page">
      {/* Hero Section */}
      <section className="pricing-hero">
        <div className="hero-content">
          <h1>Choose Your Plan</h1>
          <h2>Unlock the Power of AI-Driven Social Media Management</h2>
          <p>
            Transform your social media presence with our comprehensive suite of tools. 
            From content creation to analytics, we've got everything you need to succeed.
          </p>
          <div className="trial-badge">
            <span>🚀</span>
            <span>7-Day Free Trial Available</span>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pricing-container">
        {/* Starter Plan */}
        <div className="pricing-card">
          <div className="plan-header">
            <div className="plan-icon">
              <i className="fas fa-rocket"></i>
            </div>
            <h3>Starter</h3>
            <div className="plan-price">
              <span className="price">$29</span>
              <span className="period">/month</span>
            </div>
            <p className="plan-description">Perfect for individuals and small businesses getting started</p>
          </div>

          <div className="plan-features">
            <h4>What's Included</h4>
            <ul>
              <li><span className="feature-icon">✓</span>Up to 3 social media accounts</li>
              <li><span className="feature-icon">✓</span>50 AI-generated posts per month</li>
              <li><span className="feature-icon">✓</span>Basic analytics dashboard</li>
              <li><span className="feature-icon">✓</span>Content scheduling</li>
              <li><span className="feature-icon">✓</span>Email support</li>
            </ul>
          </div>

          <div className="plan-action">
            <a href="#" className="btn-select btn-secondary">Get Started</a>
            <p className="trial-info">7-day free trial included</p>
          </div>
        </div>

        {/* Professional Plan */}
        <div className="pricing-card popular">
          <div className="popular-badge">Most Popular</div>
          <div className="plan-header">
            <div className="plan-icon">
              <i className="fas fa-star"></i>
            </div>
            <h3>Professional</h3>
            <div className="plan-price">
              <span className="price">$79</span>
              <span className="period">/month</span>
            </div>
            <p className="plan-description">Ideal for growing businesses and marketing teams</p>
          </div>

          <div className="plan-features">
            <h4>Everything in Starter, plus</h4>
            <ul>
              <li><span className="feature-icon">✓</span>Up to 10 social media accounts</li>
              <li><span className="feature-icon">✓</span>200 AI-generated posts per month</li>
              <li><span className="feature-icon">✓</span>Advanced analytics & insights</li>
              <li><span className="feature-icon">✓</span>Competitor analysis</li>
              <li><span className="feature-icon">✓</span>Team collaboration tools</li>
              <li><span className="feature-icon">✓</span>Priority support</li>
            </ul>
          </div>

          <div className="plan-action">
            <a href="#" className="btn-select btn-primary">Choose Professional</a>
            <p className="trial-info">7-day free trial included</p>
          </div>
        </div>

        {/* Enterprise Plan */}
        <div className="pricing-card">
          <div className="plan-header">
            <div className="plan-icon">
              <i className="fas fa-building"></i>
            </div>
            <h3>Enterprise</h3>
            <div className="plan-price">
              <span className="price">Custom</span>
              <span className="period"></span>
            </div>
            <p className="plan-description">Tailored solutions for large organizations</p>
          </div>

          <div className="plan-features">
            <h4>Everything in Professional, plus</h4>
            <ul>
              <li><span className="feature-icon">✓</span>Unlimited social media accounts</li>
              <li><span className="feature-icon">✓</span>Unlimited AI-generated content</li>
              <li><span className="feature-icon">✓</span>Custom integrations</li>
              <li><span className="feature-icon">✓</span>Dedicated account manager</li>
              <li><span className="feature-icon">✓</span>Advanced security features</li>
              <li><span className="feature-icon">✓</span>24/7 phone support</li>
            </ul>
          </div>

          <div className="plan-action">
            <a href="#" className="btn-contact">Contact Sales</a>
            <p className="trial-info">Custom pricing available</p>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="pricing-faq">
        <h2>Frequently Asked Questions</h2>
        <div className="faq-grid">
          <div className="faq-item">
            <h3>Can I change my plan anytime?</h3>
            <p>Yes, you can upgrade or downgrade your plan at any time. Changes will be reflected in your next billing cycle.</p>
          </div>
          <div className="faq-item">
            <h3>Is there a free trial?</h3>
            <p>All plans come with a 7-day free trial. No credit card required to get started.</p>
          </div>
          <div className="faq-item">
            <h3>What payment methods do you accept?</h3>
            <p>We accept all major credit cards, PayPal, and bank transfers for Enterprise customers.</p>
          </div>
          <div className="faq-item">
            <h3>Can I cancel anytime?</h3>
            <p>Yes, you can cancel your subscription at any time. Your account will remain active until the end of your billing period.</p>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="pricing-cta">
        <div className="cta-content">
          <h2>Ready to Get Started?</h2>
          <p>Join thousands of businesses already using our platform to grow their social media presence.</p>
          <a href="#" className="btn-cta">Start Your Free Trial</a>
        </div>
      </section>
    </div>
  );
};

export default PricingPage;
