import React, { useState, useEffect, useRef } from 'react';
import './Dashboard.css';
import NewsForYou from './NewsForYou';
import OurStrategies from './OurStrategies';
import PostCooked from './PostCooked';
import { motion } from 'framer-motion';
import axios from 'axios';

interface ProfileInfo {
  fullName: string;
  followersCount: number;
  followsCount: number;
  profilePicUrlHD: string;
}

interface NonBrandingDashboardProps {
  accountHolder: string;
}

const NonBrandingDashboard: React.FC<NonBrandingDashboardProps> = ({ accountHolder }) => {
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [responses, setResponses] = useState<{ key: string; data: any }[]>([]);
  const [posts, setPosts] = useState<{ key: string; data: any }[]>([]);
  const [news, setNews] = useState<{ key: string; data: any }[]>([]);
  const [strategies, setStrategies] = useState<{ key: string; data: any }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 5000;

  const fetchProfileInfo = async () => {
    if (!accountHolder) return;
    setProfileLoading(true);
    setProfileError(null);
    try {
      const response = await axios.get(`http://localhost:3000/profile-info/${accountHolder}`);
      setProfileInfo(response.data);
      console.log('Profile Info Fetched:', response.data);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setProfileInfo(null);
        setProfileError('Profile info not available.');
      } else {
        setProfileError('Failed to load profile info.');
      }
    } finally {
      setProfileLoading(false);
    }
  };

  const handleSendQuery = async () => {
    if (!query.trim() || !accountHolder) return;
    try {
      await axios.post(`http://localhost:3000/save-query/${accountHolder}`, { query });
      setQuery('');
      setToast('Query sent! Response expected within 15 minutes.');
    } catch (error: any) {
      console.error('Error saving query:', error);
      setToast('Failed to send query.');
      setError(error.response?.data?.error || 'Failed to send query.');
    }
  };

  const refreshAllData = async () => {
    if (!accountHolder) {
      setError('No account holder specified.');
      return;
    }
    try {
      const [responsesData, postsData, newsData, strategiesData] = await Promise.all([
        axios.get(`http://localhost:3000/responses/${accountHolder}`).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        axios.get(`http://localhost:3000/posts/${accountHolder}`).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        axios.get(`http://localhost:3000/news-for-you/${accountHolder}`).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        axios.get(`http://localhost:3000/retrieve-engagement-strategies/${accountHolder}`).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
      ]);
      setResponses(responsesData.data);
      setPosts(postsData.data);
      console.log('Posts data fetched:', postsData.data);
      setNews(newsData.data);
      setStrategies(strategiesData.data);
      setError(null);
    } catch (error: any) {
      console.error('Error refreshing data:', error);
      setError(error.response?.data?.error || 'Failed to load dashboard data.');
    }
  };

  const setupSSE = () => {
    if (!accountHolder) {
      setError('Cannot setup SSE: No account holder specified.');
      return;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const eventSource = new EventSource(`http://localhost:3000/events/${accountHolder}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log('SSE connection established');
      reconnectAttempts.current = 0;
      setError(null);
      console.log('Initial connection established');
    };

    eventSource.onmessage = (event) => {
      reconnectAttempts.current = 0;
      let data;
      try {
        data = JSON.parse(event.data);
      } catch (err) {
        console.error('Failed to parse SSE message:', event.data, err);
        return;
      }

      if (data.type === 'heartbeat') {
        return;
      }

      if (data.type === 'connection') {
        console.log(data.message);
        return;
      }

      if (data.type === 'usernameChanged') {
        if (data.username === accountHolder) {
          refreshAllData();
          setToast('Dashboard updated!');
        }
        return;
      }

      if (data.type === 'update' && data.prefix) {
        const { prefix } = data;
        if (prefix.startsWith(`queries/${accountHolder}/`)) {
          axios.get(`http://localhost:3000/responses/${accountHolder}`).then(res => {
            setResponses(res.data);
            setToast('New response received!');
          }).catch(err => {
            console.error('Error fetching responses:', err);
            setError(err.response?.data?.error || 'Failed to fetch responses.');
          });
        }
        if (prefix.startsWith(`ready_post/${accountHolder}/`)) {
          axios.get(`http://localhost:3000/posts/${accountHolder}`).then(res => {
            setPosts(res.data);
            console.log('Updated posts via SSE:', res.data);
            setToast('New post cooked!');
          }).catch(err => {
            console.error('Error fetching posts:', err);
            setError(err.response?.data?.error || 'Failed to fetch posts.');
          });
        }
        if (prefix.startsWith(`NewForYou/${accountHolder}/`)) {
          axios.get(`http://localhost:3000/news-for-you/${accountHolder}`).then(res => {
            setNews(res.data);
            setToast('New news article available!');
          }).catch(err => {
            console.error('Error fetching news:', err);
            setError(err.response?.data?.error || 'Failed to fetch news articles.');
          });
        }
        if (prefix.startsWith(`engagement_strategies/${accountHolder}/`)) {
          axios.get(`http://localhost:3000/retrieve-engagement-strategies/${accountHolder}`).then(res => {
            setStrategies(res.data);
            setToast('New strategies available!');
          }).catch(err => {
            console.error('Error fetching strategies:', err);
            setError(err.response?.data?.error || 'Failed to fetch strategies.');
          });
        }
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      eventSource.close();
      eventSourceRef.current = null;

      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current += 1;
        const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts.current);
        console.log(`Reconnection attempt ${reconnectAttempts.current}/${maxReconnectAttempts} after ${delay/1000}s`);
        setError(`Lost connection to server updates. Reconnecting... (Attempt ${reconnectAttempts.current}/${maxReconnectAttempts})`);
        setTimeout(setupSSE, delay);
      } else {
        setError('Failed to reconnect to server updates after multiple attempts.');
      }
    };
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    if (accountHolder) {
      refreshAllData();
      fetchProfileInfo();
    }
  }, [accountHolder]);

  useEffect(() => {
    setupSSE();
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [accountHolder]);

  if (!accountHolder) {
    return <div className="error-message">Please specify an account holder to load the dashboard.</div>;
  }

  const formatCount = (count: number | undefined) => {
    if (count === undefined) return 'N/A';
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
  };

  const getProxiedImageUrl = (url: string | null) => {
    return url ? `http://localhost:3000/proxy-image?url=${encodeURIComponent(url)}` : '';
  };

  return (
    <motion.div
      className="dashboard-wrapper"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="welcome-header">
        <h1 className="welcome-text">
          Welcome {profileInfo?.fullName || accountHolder}!
        </h1>
        <p className="welcome-subtext">You are listed in Smart People!</p>
      </div>
      {error && <div className="error-message">{error}</div>}
      {profileError && <div className="error-message">{profileError}</div>}
      <div className="dashboard-grid">
        <div className="profile-metadata">
          <div className="profile-header">
            {profileLoading ? (
              <div className="profile-loading">Loading...</div>
            ) : (
              <div className="profile-bar">
{profileInfo?.profilePicUrlHD && !imageError ? (
  <img
    src={getProxiedImageUrl(profileInfo.profilePicUrlHD)}
    alt={`${accountHolder}'s profile picture`}
    className="profile-pic-bar"
    onError={() => setImageError(true)}
    onLoad={() => setImageError(false)}
  />
) : (
  <div className="profile-pic-bar" />
)}
                <div className="stats">
                  <div className="stat">
                    <span className="label">Followers</span>
                    <span className="value">
                      {formatCount(profileInfo?.followersCount)}
                    </span>
                  </div>
                  <div className="stat">
                    <span className="label">Following</span>
                    <span className="value">
                      {formatCount(profileInfo?.followsCount)}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div className="chart-placeholder"></div>
          </div>
        </div>

        <div className="notifications">
          <h2>Notifications <span className="badge">{responses.length || 2} queries answered!!!</span></h2>
          <div className="notification-list">
            {[...Array(5)].map((_, index) => (
              <div key={index} className="notification-item">
                Notification {index + 1}
              </div>
            ))}
          </div>
        </div>

        <div className="post-cooked">
<PostCooked
  username={accountHolder}
  posts={posts}
  profilePicUrl={getProxiedImageUrl(profileInfo?.profilePicUrlHD || '')}
/>
        </div>

        <div className="strategies">
          <h2>Our Strategies <span className="badge">{strategies.length || 3} unseen!!!</span></h2>
          <OurStrategies accountHolder={accountHolder} accountType="non-branding" />
        </div>

        <div className="competitor-analysis">
          <h2>News For You <span className="badge">{news.length || 5} new articles!!!</span></h2>
          <NewsForYou accountHolder={accountHolder} />
        </div>

        <div className="chatbot">
          <div className="chatbot-input-container">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Leave Order/Message/Query to your MANAGER..."
              className="chatbot-input"
            />
            <button className="chatbot-send-btn" onClick={handleSendQuery} disabled={!query.trim()}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#e0e0ff"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>

        {toast && (
          <motion.div
            className="toast-notification"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.3 }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#00ffcc"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="toast-icon"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
            {toast}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

export default NonBrandingDashboard;