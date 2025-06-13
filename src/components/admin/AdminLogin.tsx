import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import UserService from '../../services/UserService';
import './AdminLogin.css';
import AdminDashboard from './AdminDashboard';

interface AdminLoginProps {
  onAdminAccess?: (isAdmin: boolean) => void;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ onAdminAccess }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  
  // States for different admin access modes
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [error, setError] = useState('');
  const [isQueryParamAdmin, setIsQueryParamAdmin] = useState(false);
  const [isQueryParamAuthenticated, setIsQueryParamAuthenticated] = useState(false);

  // Check for secret URL parameters
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const adminParam = params.get('admin');
    
    if (adminParam === 'sentientai') {
      setIsQueryParamAdmin(true);
      // Check if already authenticated for query param admin
      const adminAuth = localStorage.getItem('admin_authenticated');
      if (adminAuth === 'true') {
        setIsQueryParamAuthenticated(true);
      }
    } else {
      setIsQueryParamAdmin(false);
      setIsQueryParamAuthenticated(false);
    }
    
    // Check for other admin patterns
    if (params.get('admin') === 'sentientai' || location.pathname.includes('/admin-secret') || location.search.includes('admin=sentientai')) {
      setShowAdminLogin(true);
    }
  }, [location]);

  // Check if user is already in admin mode
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (currentUser?.uid) {
        try {
          const user = await UserService.getUserData(currentUser.uid);
          if (user?.userType === 'admin') {
            setIsAdminMode(true);
            onAdminAccess?.(true);
          }
        } catch (error) {
          console.error('Error checking admin status:', error);
        }
      }
    };

    checkAdminStatus();
  }, [currentUser?.uid, onAdminAccess]);

  // Handle query parameter admin login
  const handleQueryParamLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (credentials.username === 'sentientai' && credentials.password === 'Sentiant123@') {
      setIsQueryParamAuthenticated(true);
      localStorage.setItem('admin_authenticated', 'true');
      setError('');
    } else {
      setError('Invalid credentials');
      setCredentials({ username: '', password: '' });
    }
  };

  // Handle regular admin login
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!currentUser?.uid) {
      setError('Please login first');
      return;
    }

    const isValidAdmin = UserService.authenticateAdmin(credentials.username, credentials.password);
    
    if (isValidAdmin) {
      try {
        await UserService.upgradeToAdmin(currentUser.uid);
        setIsAdminMode(true);
        setShowAdminLogin(false);
        onAdminAccess?.(true);
        
        // Clear credentials
        setCredentials({ username: '', password: '' });
        
        // Navigate to admin dashboard
        navigate('/admin');
        
        // Show success message
        alert('✅ Admin access granted! You now have unlimited access to all features.');
      } catch (error) {
        setError('Failed to upgrade to admin');
      }
    } else {
      setError('Invalid credentials');
    }
  };

  const handleLogout = () => {
    setIsQueryParamAuthenticated(false);
    localStorage.removeItem('admin_authenticated');
    setCredentials({ username: '', password: '' });
    navigate('/'); // Redirect to home
  };

  // Query parameter admin authenticated - show AdminDashboard
  if (isQueryParamAdmin && isQueryParamAuthenticated) {
    return <AdminDashboard />;
  }

  // Query parameter admin not authenticated - show login form
  if (isQueryParamAdmin && !isQueryParamAuthenticated) {
    return (
      <div className="admin-login-overlay">
        <div className="admin-login-container">
          <div className="admin-login-header">
            <h2>Admin Access</h2>
            <p>Authorized Personnel Only</p>
          </div>
          
          <form onSubmit={handleQueryParamLogin} className="admin-login-form">
            <div className="form-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                value={credentials.username}
                onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                required
                autoComplete="username"
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={credentials.password}
                onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                required
                autoComplete="current-password"
              />
            </div>
            
            {error && <div className="error-message">{error}</div>}
            
            <button type="submit" className="admin-login-button">
              Access Admin Panel
            </button>
          </form>
          
          <div className="admin-login-footer">
            <p>Secure Admin Interface</p>
          </div>
        </div>
      </div>
    );
  }

  // Regular admin mode badge
  if (isAdminMode) {
    return (
      <div style={{
        position: 'fixed',
        top: '20px',
        left: '20px',
        background: 'linear-gradient(135deg, #ff6b35 0%, #ff8e53 100%)',
        color: '#fff',
        padding: '8px 16px',
        borderRadius: '20px',
        fontSize: '0.8rem',
        fontWeight: 'bold',
        zIndex: 1000,
        boxShadow: '0 4px 12px rgba(255, 107, 53, 0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px'
      }}>
        <span>⚡</span>
        <span>ADMIN MODE</span>
      </div>
    );
  }

  // Regular admin login form
  if (showAdminLogin) {
    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #1a1a3a 0%, #2e2e5e 100%)',
          border: '2px solid #ff6b35',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '400px',
          width: '90%',
          boxShadow: '0 8px 32px rgba(255, 107, 53, 0.3)'
        }}>
          <h3 style={{ 
            color: '#ff6b35', 
            textAlign: 'center', 
            margin: '0 0 20px 0',
            fontSize: '1.2rem'
          }}>
            🔐 Admin Access
          </h3>
          
          <form onSubmit={handleAdminLogin}>
            <div style={{ marginBottom: '16px' }}>
              <input
                type="text"
                placeholder="Username"
                value={credentials.username}
                onChange={(e) => setCredentials(prev => ({ ...prev, username: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  color: '#e0e0ff',
                  fontSize: '1rem'
                }}
              />
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <input
                type="password"
                placeholder="Password"
                value={credentials.password}
                onChange={(e) => setCredentials(prev => ({ ...prev, password: e.target.value }))}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  color: '#e0e0ff',
                  fontSize: '1rem'
                }}
              />
            </div>
            
            {error && (
              <div style={{
                color: '#ff4444',
                textAlign: 'center',
                marginBottom: '16px',
                fontSize: '0.9rem'
              }}>
                {error}
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setShowAdminLogin(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '6px',
                  color: '#e0e0ff',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              
              <button
                type="submit"
                style={{
                  flex: 1,
                  padding: '12px',
                  background: 'linear-gradient(135deg, #ff6b35, #ff8e53)',
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontWeight: 'bold',
                  cursor: 'pointer'
                }}
              >
                Login
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return null;
};

// Hook to check admin status
export const useAdminStatus = () => {
  const { currentUser } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdminStatus = async () => {
      if (currentUser?.uid) {
        try {
          const user = await UserService.getUserData(currentUser.uid);
          setIsAdmin(user?.userType === 'admin');
        } catch (error) {
          console.error('Error checking admin status:', error);
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    };

    checkAdminStatus();
  }, [currentUser?.uid]);

  return { isAdmin, loading };
};

// Admin badge component
export const AdminBadge: React.FC = () => {
  const { isAdmin } = useAdminStatus();
  
  if (!isAdmin) return null;

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      left: '20px',
      background: 'linear-gradient(135deg, #ff6b35 0%, #ff8e53 100%)',
      color: '#fff',
      padding: '8px 16px',
      borderRadius: '20px',
      fontSize: '0.8rem',
      fontWeight: 'bold',
      zIndex: 1000,
      boxShadow: '0 4px 12px rgba(255, 107, 53, 0.3)',
      display: 'flex',
      alignItems: 'center',
      gap: '6px'
    }}>
      <span>⚡</span>
      <span>ADMIN MODE</span>
    </div>
  );
};

export default AdminLogin; 