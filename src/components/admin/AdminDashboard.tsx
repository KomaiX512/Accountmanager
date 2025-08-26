import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useAdminStatus } from './AdminLogin';
import { getApiUrl } from '../../config/api';
import './AdminDashboard.css';

interface AdminStats {
  totalUsers: number;
  userTypes: { [key: string]: number };
  subscriptionStats: { [key: string]: number };
  generatedAt: string;
}

interface SystemHealth {
  success: boolean;
  message: string;
  writeTest: boolean;
  readTest: boolean;
}

const AdminDashboard: React.FC = () => {
  const { isAdmin, loading } = useAdminStatus();
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) {
      if (!currentUser) {
        navigate('/login');
        return;
      }
      
      if (!isAdmin) {
        navigate('/');
        return;
      }
      
      fetchAdminData();
    }
  }, [loading, isAdmin, currentUser, navigate]);

  const fetchAdminData = async () => {
    setLoadingStats(true);
    setLoadingHealth(true);
    setError(null);

    try {
      // Fetch admin analytics using getApiUrl
      const statsResponse = await fetch(getApiUrl('/api/admin/analytics'));
      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData);
      } else {
        throw new Error('Failed to fetch admin analytics');
      }
    } catch (err: any) {
      console.error('Error fetching admin stats:', err);
      setError('Failed to load admin analytics');
    } finally {
      setLoadingStats(false);
    }

    try {
      // Test system health using getApiUrl
      const healthResponse = await fetch(getApiUrl('/api/admin/test'));
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        setHealth(healthData);
      } else {
        throw new Error('Failed to test system health');
      }
    } catch (err: any) {
      console.error('Error testing system health:', err);
      setHealth({
        success: false,
        message: 'System health check failed',
        writeTest: false,
        readTest: false
      });
    } finally {
      setLoadingHealth(false);
    }
  };

  const handleRefresh = () => {
    fetchAdminData();
  };

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading admin dashboard...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>Admin Dashboard</h1>
        <button onClick={handleRefresh} className="refresh-btn">
          Refresh Data
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <p>{error}</p>
        </div>
      )}

      <div className="admin-grid">
        {/* System Health Card */}
        <div className="admin-card">
          <h2>System Health</h2>
          {loadingHealth ? (
            <div className="card-loading">
              <div className="mini-spinner"></div>
              <span>Checking system health...</span>
            </div>
          ) : (
            <div className="health-status">
              <div className={`health-indicator ${health?.success ? 'healthy' : 'unhealthy'}`}>
                <span className="status-icon">
                  {health?.success ? '✅' : '❌'}
                </span>
                <span className="status-text">
                  {health?.success ? 'System Operational' : 'System Issues Detected'}
                </span>
              </div>
              
              <div className="health-details">
                <div className="health-item">
                  <span>Write Test:</span>
                  <span className={health?.writeTest ? 'success' : 'failure'}>
                    {health?.writeTest ? '✓ Pass' : '✗ Fail'}
                  </span>
                </div>
                <div className="health-item">
                  <span>Read Test:</span>
                  <span className={health?.readTest ? 'success' : 'failure'}>
                    {health?.readTest ? '✓ Pass' : '✗ Fail'}
                  </span>
                </div>
              </div>
              
              <p className="health-message">{health?.message}</p>
            </div>
          )}
        </div>

        {/* User Statistics Card */}
        <div className="admin-card">
          <h2>User Statistics</h2>
          {loadingStats ? (
            <div className="card-loading">
              <div className="mini-spinner"></div>
              <span>Loading user statistics...</span>
            </div>
          ) : stats ? (
            <div className="stats-content">
              <div className="stat-item total-users">
                <div className="stat-number">{stats.totalUsers}</div>
                <div className="stat-label">Total Users</div>
              </div>
              
              <div className="stat-section">
                <h3>User Types</h3>
                <div className="stat-bars">
                  {Object.entries(stats.userTypes).map(([type, count]) => (
                    <div key={type} className="stat-bar">
                      <span className="bar-label">{type}</span>
                      <div className="bar-container">
                        <div 
                          className={`bar-fill ${type}`}
                          style={{ width: `${(count / stats.totalUsers) * 100}%` }}
                        ></div>
                      </div>
                      <span className="bar-count">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="stat-section">
                <h3>Subscriptions</h3>
                <div className="stat-bars">
                  {Object.entries(stats.subscriptionStats).map(([status, count]) => (
                    <div key={status} className="stat-bar">
                      <span className="bar-label">{status}</span>
                      <div className="bar-container">
                        <div 
                          className={`bar-fill ${status}`}
                          style={{ width: `${(count / stats.totalUsers) * 100}%` }}
                        ></div>
                      </div>
                      <span className="bar-count">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="stats-footer">
                <small>Last updated: {new Date(stats.generatedAt).toLocaleString()}</small>
              </div>
            </div>
          ) : (
            <div className="no-data">
              <p>No statistics available</p>
            </div>
          )}
        </div>

        {/* Quick Actions Card */}
        <div className="admin-card">
          <h2>Quick Actions</h2>
          <div className="actions-grid">
            <button 
              onClick={() => navigate('/pricing')} 
              className="action-btn pricing"
            >
              <span className="action-icon">💰</span>
              <span>View Pricing</span>
            </button>
            
            <button 
              onClick={() => console.log('Image server monitoring via logs only')} 
              className="action-btn server"
              disabled
              title="Image server access disabled for production safety"
            >
              <span className="action-icon">🖥️</span>
              <span className="action-text">Image Server (Monitor via Logs)</span>
            </button>
            
            <button 
              onClick={handleRefresh} 
              className="action-btn refresh"
            >
              <span className="action-icon">🔄</span>
              <span>Refresh Data</span>
            </button>
            
            <button 
              onClick={() => navigate('/')} 
              className="action-btn dashboard"
            >
              <span className="action-icon">📊</span>
              <span>Main Dashboard</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard; 