import React, { useState, useEffect, useRef } from 'react';
import './Dashboard.css';
import Cs_Analysis from './Cs_Analysis';
import OurStrategies from './OurStrategies';
import PostCooked from './PostCooked';
import InstagramConnect from './InstagramConnect';
import Dms_Comments from './Dms_Comments';
import { motion } from 'framer-motion';
import axios from 'axios';

interface ProfileInfo {
  fullName: string;
  followersCount: number;
  followsCount: number;
  profilePicUrlHD: string;
}

interface Notification {
  type: 'message' | 'comment';
  instagram_user_id: string;
  sender_id?: string;
  message_id?: string;
  text: string;
  post_id?: string;
  comment_id?: string;
  timestamp: number;
  received_at: string;
}

interface DashboardProps {
  accountHolder: string;
  competitors: string[];
}

const Dashboard: React.FC<DashboardProps> = ({ accountHolder, competitors }) => {
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [responses, setResponses] = useState<{ key: string; data: any }[]>([]);
  const [strategies, setStrategies] = useState<{ key: string; data: any }[]>([]);
  const [posts, setPosts] = useState<{ key: string; data: any }[]>([]);
  const [competitorData, setCompetitorData] = useState<{ key: string; data: any }[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [igBusinessId, setIgBusinessId] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 5000;
  const firstLoadRef = useRef(true);
  const lastProfilePicRenderTimeRef = useRef<number>(0);

  const fetchProfileInfo = async () => {
    if (!accountHolder) return;
    setProfileLoading(true);
    setProfileError(null);
    try {
      const now = Date.now();
      if (now - lastProfilePicRenderTimeRef.current < 1800000 && profileInfo) {
        console.log('Skipping profile pic fetch due to throttle');
        setProfileLoading(false);
        return;
      }
      const response = await axios.get(`http://localhost:3000/profile-info/${accountHolder}`);
      setProfileInfo(response.data);
      lastProfilePicRenderTimeRef.current = now;
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

  const fetchNotifications = async (userId: string) => {
    try {
      const response = await axios.get(`http://localhost:3000/events-list/${userId}`);
      setNotifications(response.data.sort((a: Notification, b: Notification) => b.timestamp - a.timestamp).slice(0, 10));
      console.log(`[${new Date().toISOString()}] Fetched notifications:`, response.data);
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError('Failed to load notifications.');
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
      const forceRefresh = firstLoadRef.current;
      const [responsesData, strategiesData, postsData, competitorDataResponses] = await Promise.all([
        axios.get(`http://localhost:3000/responses/${accountHolder}${forceRefresh ? '?forceRefresh=true' : ''}`).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        axios.get(`http://localhost:3000/retrieve-strategies/${accountHolder}${forceRefresh ? '?forceRefresh=true' : ''}`).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        axios.get(`http://localhost:3000/posts/${accountHolder}${forceRefresh ? '?forceRefresh=true' : ''}`).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        Promise.all(
          competitors.map(comp =>
            axios.get(`http://localhost:3000/retrieve/${accountHolder}/${comp}${forceRefresh ? '?forceRefresh=true' : ''}`).catch(err => {
              if (err.response?.status === 404) {
                console.warn(`No competitor data found for ${comp}`);
                return { data: [] };
              }
              throw err;
            })
          )
        ),
      ]);
      setResponses(responsesData.data);
      setStrategies(strategiesData.data);
      setPosts(postsData.data);
      setCompetitorData(competitorDataResponses.flatMap(res => res.data));
      setError(null);
      if (firstLoadRef.current) {
        firstLoadRef.current = false;
      }
    } catch (error: any) {
      console.error('Error refreshing data:', error);
      setError(error.response?.data?.error || 'Failed to load dashboard data.');
    }
  };

  const setupSSE = (userId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const eventSource = new EventSource(`http://localhost:3000/events/${userId}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log(`[${new Date().toISOString()}] SSE connection established for ${userId}`);
      reconnectAttempts.current = 0;
      setError(null);
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

      if (data.type === 'heartbeat') return;
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
        if (prefix.startsWith(`recommendations/${accountHolder}/`)) {
          axios.get(`http://localhost:3000/retrieve-strategies/${accountHolder}`).then(res => {
            setStrategies(res.data);
            setToast('New strategies available!');
          }).catch(err => {
            console.error('Error fetching strategies:', err);
            setError(err.response?.data?.error || 'Failed to fetch strategies.');
          });
        }
        if (prefix.startsWith(`ready_post/${accountHolder}/`)) {
          axios.get(`http://localhost:3000/posts/${accountHolder}`).then(res => {
            setPosts(res.data);
            setToast('New post cooked!');
          }).catch(err => {
            console.error('Error fetching posts:', err);
            setError(err.response?.data?.error || 'Failed to fetch posts.');
          });
        }
        if (prefix.startsWith(`competitor_analysis/${accountHolder}/`)) {
          Promise.all(
            competitors.map(comp =>
              axios.get(`http://localhost:3000/retrieve/${accountHolder}/${comp}`).catch(err => {
                if (err.response?.status === 404) return { data: [] };
                throw err;
              })
            )
          )
            .then(res => {
              setCompetitorData(res.flatMap(r => r.data));
              setToast('New competitor analysis available!');
            })
            .catch(err => {
              console.error('Error fetching competitor data:', err);
              setError(err.response?.data?.error || 'Failed to fetch competitor analysis.');
            });
        }
      }

      if (data.event === 'message' || data.event === 'comment') {
        setNotifications(prev => {
          const updated = [data.data, ...prev.filter(n => n.message_id !== data.data.message_id && n.comment_id !== data.data.comment_id)];
          return updated.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
        });
        setToast(data.event === 'message' ? 'New Instagram message received!' : 'New Instagram comment received!');
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
        setTimeout(() => setupSSE(userId), delay);
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
  }, [accountHolder, competitors]);

  useEffect(() => {
    if (igBusinessId) {
      fetchNotifications(igBusinessId);
      setupSSE(igBusinessId);
    }
  }, [igBusinessId]);

  const handleInstagramConnected = (userId: string) => {
    console.log(`[${new Date().toISOString()}] Instagram connected for user ID: ${userId}`);
    setIgBusinessId(userId);
    setToast('Instagram account connected successfully!');
  };

  if (!accountHolder) {
    return <div className="error-message">Please specify an account holder to load the dashboard.</div>;
  }

  const formatCount = (count: number | undefined) => {
    if (count === undefined) return 'N/A';
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
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
      <div className="modules-container">
        <div className="dashboard-grid">
          <div className="profile-metadata">
            <div className="profile-header">
              {profileLoading ? (
                <div className="profile-loading">Loading...</div>
              ) : (
                <div className="profile-bar">
                  {profileInfo?.profilePicUrlHD && !imageError ? (
                    <img
                      src={`http://localhost:3000/proxy-image?url=${encodeURIComponent(profileInfo.profilePicUrlHD)}`}
                      alt={`${accountHolder}'s profile picture`}
                      className="profile-pic-bar"
                      onError={() => {
                        console.error(`Failed to load profile picture for ${accountHolder}`);
                        setImageError(true);
                      }}
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
                  <InstagramConnect onConnected={handleInstagramConnected} />
                </div>
              )}
              <div className="chart-placeholder"></div>
            </div>
          </div>

          <div className="notifications">
            <h2>Notifications <span className="badge">{notifications.length || 0} new!!!</span></h2>
            <Dms_Comments notifications={notifications} />
          </div>

          <div className="post-cooked">
            <PostCooked
              username={accountHolder}
              profilePicUrl={profileInfo?.profilePicUrlHD ? `http://localhost:3000/proxy-image?url=${encodeURIComponent(profileInfo.profilePicUrlHD)}` : ''}
              posts={posts}
            />
          </div>

          <div className="strategies">
            <h2>Our Strategies <span className="badge">{strategies.length || 3} unseen!!!</span></h2>
            <OurStrategies accountHolder={accountHolder} accountType="branding" />
          </div>

          <div className="competitor-analysis">
            <h2>Competitor Analysis <span className="badge">{competitorData.length || 5} unseen!!!</span></h2>
            <Cs_Analysis accountHolder={accountHolder} competitors={competitors} />
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
    </motion.div>
  );
};

export default Dashboard;