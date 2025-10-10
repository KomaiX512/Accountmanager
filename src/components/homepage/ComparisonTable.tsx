import React from 'react';
import { motion } from 'framer-motion';
import { FaCheck, FaTimes, FaClock, FaRocket } from 'react-icons/fa';

interface Feature {
  name: string;
  sentientm: string | boolean;
  competitors: string | boolean;
  icon?: React.ReactNode;
}

const features: Feature[] = [
  {
    name: "AI Content Generation",
    sentientm: true,
    competitors: false,
    icon: <FaRocket />
  },
  {
    name: "24/7 Automated Posting",
    sentientm: true,
    competitors: "Limited",
    icon: <FaClock />
  },
  {
    name: "Multi-Platform Support",
    sentientm: "Instagram, Twitter, Facebook",
    competitors: "Instagram, Twitter, Facebook",
  },
  {
    name: "LinkedIn Integration",
    sentientm: "Coming Soon",
    competitors: true,
    icon: <FaClock />
  },
  {
    name: "Meta Official API",
    sentientm: "Pending Approval",
    competitors: true,
    icon: <FaClock />
  },
  {
    name: "TikTok & YouTube",
    sentientm: "Q2 2025",
    competitors: "Limited",
    icon: <FaClock />
  },
  {
    name: "RAG Technology",
    sentientm: true,
    competitors: false,
    icon: <FaRocket />
  },
  {
    name: "Voice Learning",
    sentientm: true,
    competitors: false,
    icon: <FaRocket />
  },
  {
    name: "Predictive Analytics",
    sentientm: true,
    competitors: "Basic",
    icon: <FaRocket />
  },
  {
    name: "Price",
    sentientm: "$29.99/month",
    competitors: "$99-$299/month",
    icon: <FaRocket />
  },
];

const ComparisonTable: React.FC = () => {
  const renderValue = (value: string | boolean) => {
    if (typeof value === 'boolean') {
      return value ? (
        <FaCheck className="check-icon" />
      ) : (
        <FaTimes className="times-icon" />
      );
    }
    return <span className={value.includes('Coming') || value.includes('Pending') ? 'pending' : ''}>{value}</span>;
  };

  return (
    <div className="comparison-container">
      <motion.div
        className="comparison-header"
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8 }}
        viewport={{ once: true }}
      >
        <h2 className="comparison-title">
          Transparent About Our <span className="gradient-text">Journey</span>
        </h2>
        <p className="comparison-subtitle">
          What's ready now and what's coming next
        </p>
      </motion.div>

      <motion.div
        className="comparison-table"
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        viewport={{ once: true }}
      >
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Features</th>
                <th className="sentientm-col">
                  <div className="brand-header">
                    <span className="gradient-text">SentientM</span>
                    <span className="badge">AI Powered</span>
                  </div>
                </th>
                <th className="competitors-col">
                  <div className="brand-header">
                    <span>Traditional Tools</span>
                    <span className="badge secondary">Manual</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {features.map((feature, index) => (
                <motion.tr
                  key={feature.name}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.05 }}
                  viewport={{ once: true }}
                >
                  <td className="feature-name">
                    {feature.icon && <span className="feature-icon">{feature.icon}</span>}
                    <span>{feature.name}</span>
                  </td>
                  <td className="sentientm-value">
                    {renderValue(feature.sentientm)}
                  </td>
                  <td className="competitors-value">
                    {renderValue(feature.competitors)}
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        <motion.div 
          className="table-footer"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          viewport={{ once: true }}
        >
          <div className="footer-card potential">
            <h4>🚀 Our Potential</h4>
            <ul>
              <li>AI that learns and improves daily</li>
              <li>90% lower cost than competitors</li>
              <li>300% better engagement rates</li>
              <li>Expanding to all platforms by 2025</li>
            </ul>
          </div>
          
          <div className="footer-card limitations">
            <h4>⏳ Current Limitations</h4>
            <ul>
              <li>LinkedIn API integration pending</li>
              <li>Meta official approval in progress</li>
              <li>TikTok & YouTube coming Q2 2025</li>
              <li>Limited to 3 platforms currently</li>
            </ul>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default ComparisonTable;
