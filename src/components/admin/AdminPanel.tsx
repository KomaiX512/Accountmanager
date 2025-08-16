import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import UserService from '../../services/UserService';
import './AdminPanel.css';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface AdminState {
  isAuthenticated: boolean;
  adminToken: string | null;
  loading: boolean;
  error: string | null;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const [adminState, setAdminState] = useState<AdminState>({
    isAuthenticated: false,
    adminToken: null,
    loading: false,
    error: null
  });

  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });

  const [upgradeUserId, setUpgradeUserId] = useState('');
  const [isUpgrading, setIsUpgrading] = useState(false);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await UserService.authenticateAdmin(credentials.username, credentials.password);
      
      if (result.success) {
        setAdminState({
          isAuthenticated: true,
          adminToken: result.adminToken || null,
          loading: false,
          error: null
        });
        setCredentials({ username: '', password: '' });
      } else {
        setAdminState(prev => ({
          ...prev,
          loading: false,
          error: result.message
        }));
      }
    } catch (error) {
      setAdminState(prev => ({
        ...prev,
        loading: false,
        error: 'Authentication failed'
      }));
    }
  };

  const handleUpgradeUser = async () => {
    if (!upgradeUserId.trim() || !adminState.adminToken) return;

    setIsUpgrading(true);
    try {
      const result = await UserService.upgradeToAdmin(upgradeUserId.trim(), adminState.adminToken);
      
      if (result.success) {
        alert(`Successfully upgraded user ${upgradeUserId} to admin!`);
        setUpgradeUserId('');
      } else {
        alert(result.message);
      }
    } catch (error) {
      alert('Upgrade failed. Please try again.');
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleUpgradeCurrentUser = async () => {
    if (!currentUser?.uid || !adminState.adminToken) return;

    setIsUpgrading(true);
    try {
      const result = await UserService.upgradeToAdmin(currentUser.uid, adminState.adminToken);
      
      if (result.success) {
        alert('Successfully upgraded your account to admin!');
        window.location.reload(); // Refresh to update user data
      } else {
        alert(result.message);
      }
    } catch (error) {
      alert('Upgrade failed. Please try again.');
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleLogout = () => {
    setAdminState({
      isAuthenticated: false,
      adminToken: null,
      loading: false,
      error: null
    });
    setCredentials({ username: '', password: '' });
    setUpgradeUserId('');
  };

  return (
    <div className="admin-overlay" onClick={onClose}>
      <div className="admin-panel" onClick={(e) => e.stopPropagation()}>
        <div className="admin-header">
          <h2>🛡️ Admin Control Panel</h2>
          <button className="admin-close" onClick={onClose}>✕</button>
        </div>

        {!adminState.isAuthenticated ? (
          // Login Form
          <div className="admin-login">
            <form onSubmit={handleLogin}>
              <div className="form-group">
                <label htmlFor="admin-username">Username:</label>
                <input
                  id="admin-username"
                  type="text"
                  value={credentials.username}
                  onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="Enter admin username"
                  required
                  disabled={adminState.loading}
                />
              </div>

              <div className="form-group">
                <label htmlFor="admin-password">Password:</label>
                <input
                  id="admin-password"
                  type="password"
                  value={credentials.password}
                  onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Enter admin password"
                  required
                  disabled={adminState.loading}
                />
              </div>

              {adminState.error && (
                <div className="error-message">
                  ❌ {adminState.error}
                </div>
              )}

              <button 
                type="submit" 
                className="btn-admin-login"
                disabled={adminState.loading}
              >
                {adminState.loading ? (
                  <>
                    <span className="spinner"></span>
                    Authenticating...
                  </>
                ) : (
                  'Login to Admin Panel'
                )}
              </button>
            </form>

            <div className="admin-info">
              <p>🔒 This is a secure admin area. Only authorized personnel with valid credentials can access this panel.</p>
            </div>
          </div>
        ) : (
          // Admin Dashboard
          <div className="admin-dashboard">
            <div className="admin-welcome">
              <p>✅ Welcome, Administrator!</p>
              <button className="btn-logout" onClick={handleLogout}>
                Logout
              </button>
            </div>

            <div className="admin-sections">
              {/* Current User Upgrade */}
              {currentUser && (
                <div className="admin-section">
                  <h3>🔧 Current User Controls</h3>
                  <div className="user-info">
                    <p><strong>User ID:</strong> {currentUser.uid}</p>
                    <p><strong>Email:</strong> {currentUser.email}</p>
                  </div>
                  <button 
                    className="btn-upgrade"
                    onClick={handleUpgradeCurrentUser}
                    disabled={isUpgrading}
                  >
                    {isUpgrading ? (
                      <>
                        <span className="spinner"></span>
                        Upgrading...
                      </>
                    ) : (
                      'Upgrade My Account to Admin'
                    )}
                  </button>
                </div>
              )}

              {/* User Management */}
              <div className="admin-section">
                <h3>👥 User Management</h3>
                <div className="form-group">
                  <label htmlFor="upgrade-user-id">User ID to Upgrade:</label>
                  <input
                    id="upgrade-user-id"
                    type="text"
                    value={upgradeUserId}
                    onChange={(e) => setUpgradeUserId(e.target.value)}
                    placeholder="Enter Firebase User ID"
                    disabled={isUpgrading}
                  />
                </div>
                <button 
                  className="btn-upgrade"
                  onClick={handleUpgradeUser}
                  disabled={!upgradeUserId.trim() || isUpgrading}
                >
                  {isUpgrading ? (
                    <>
                      <span className="spinner"></span>
                      Upgrading...
                    </>
                  ) : (
                    'Upgrade User to Admin'
                  )}
                </button>
              </div>

              {/* System Information */}
              <div className="admin-section">
                <h3>🔍 System Information</h3>
                <div className="system-info">
                  <div className="info-item">
                    <span className="info-label">Admin Token:</span>
                    <span className="info-value">{adminState.adminToken?.substring(0, 20)}...</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Session Time:</span>
                    <span className="info-value">{new Date().toLocaleString()}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Environment:</span>
                    <span className="info-value">{import.meta.env.MODE || 'development'}</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="admin-section">
                <h3>⚡ Quick Actions</h3>
                <div className="quick-actions">
                  <button 
                    className="btn-action"
                    onClick={() => window.open('/pricing', '_blank')}
                  >
                    📊 View Pricing Page
                  </button>
                  <button 
                    className="btn-action"
                    onClick={() => {
                      UserService.clearUserCache();
                      alert('User cache cleared successfully!');
                    }}
                  >
                    🗑️ Clear User Cache
                  </button>
                  <button 
                    className="btn-action"
                    onClick={() => window.location.reload()}
                  >
                    🔄 Refresh Application
                  </button>
                </div>
              </div>
            </div>

            <div className="admin-footer">
              <p>⚠️ Use admin privileges responsibly. All actions are logged.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel; 