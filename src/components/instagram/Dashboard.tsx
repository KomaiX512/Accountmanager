import React, { useState, useEffect, useRef } from 'react';
import './Dashboard.css';
import Cs_Analysis from './Cs_Analysis';
import OurStrategies from './OurStrategies';
import PostCooked from './PostCooked';
import InstagramConnect from './InstagramConnect';
import DmsComments from './Dms_Comments';
import PostScheduler from './PostScheduler';
import InsightsModal from './InsightsModal';
import GoalModal from './GoalModal';
import NewsForYou from './NewsForYou';
import { motion } from 'framer-motion';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import InstagramRequiredButton from '../common/InstagramRequiredButton';
import { useInstagram } from '../../context/InstagramContext';

interface ProfileInfo {
  fullName: string;
  followersCount: number;
  followsCount: number;
  profilePicUrlHD: string;
}

interface Notification {
  type: 'message' | 'comment' | 'reply' | 'comment_reply';
  instagram_user_id: string;
  sender_id?: string;
  message_id?: string;
  text: string;
  post_id?: string;
  comment_id?: string;
  timestamp: number;
  received_at: string;
  username?: string;
  status: 'pending' | 'replied' | 'ignored' | 'sent';
}

interface DashboardProps {
  accountHolder: string;
  competitors: string[];
  accountType: 'branding' | 'non-branding';
}

const Dashboard: React.FC<DashboardProps> = ({ accountHolder, competitors, accountType }) => {
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [responses, setResponses] = useState<{ key: string; data: any }[]>([]);
  const [strategies, setStrategies] = useState<{ key: string; data: any }[]>([]);
  const [posts, setPosts] = useState<{ key: string; data: any }[]>([]);
  const [competitorData, setCompetitorData] = useState<{ key: string; data: any }[]>([]);
  const [news, setNews] = useState<{ key: string; data: any }[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [profileInfo, setProfileInfo] = useState<ProfileInfo | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [imageError, setImageError] = useState(false);
  const { userId: igBusinessId, isConnected: isInstagramConnected, connectInstagram } = useInstagram();
  const [isSchedulerOpen, setIsSchedulerOpen] = useState(false);
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [replySentTracker, setReplySentTracker] = useState<{
    text: string;
    timestamp: number;
    type: 'dm' | 'comment';
    id: string;
  }[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 5000;
  const firstLoadRef = useRef(true);
  const lastProfilePicRenderTimeRef = useRef<number>(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const { currentUser } = useAuth();

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
      const response = await axios.get(`http://localhost:3000/profile-info/${accountHolder}?forceRefresh=true`);
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

  const fetchIgBusinessId = async (attempt = 1, maxAttempts = 3) => {
    if (!accountHolder) return;
    
    try {
      const response = await axios.get(`http://localhost:3000/profile-info/${accountHolder}`);
      const userId = response.data?.id;
      if (userId && !igBusinessId) {
        if (!isInstagramConnected) {
          connectInstagram(userId, userId);
        }
        console.log(`[${new Date().toISOString()}] Set igBusinessId from profile: ${userId}`);
      } else if (!userId) {
        console.error(`[${new Date().toISOString()}] No userId found in profile info`);
        if (attempt < maxAttempts) {
          console.log(`[${new Date().toISOString()}] Retrying fetchIgBusinessId, attempt ${attempt + 1}/${maxAttempts}`);
          setTimeout(() => fetchIgBusinessId(attempt + 1, maxAttempts), 2000);
        } else {
          setError('Failed to initialize Instagram account after retries.');
        }
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error fetching profile info (attempt ${attempt}/${maxAttempts}):`, err);
      if (attempt < maxAttempts) {
        console.log(`[${new Date().toISOString()}] Retrying fetchIgBusinessId in 2s...`);
        setTimeout(() => fetchIgBusinessId(attempt + 1, maxAttempts), 2000);
      } else {
        setError('Failed to initialize Instagram account after retries.');
      }
    }
  };

  const fetchNotifications = async (userId: string, attempt = 1, maxAttempts = 3) => {
    try {
      const response = await axios.get(`http://localhost:3000/events-list/${userId}`);
      const fetchedNotifications = response.data.sort((a: Notification, b: Notification) => b.timestamp - a.timestamp);
      
      // Filter out any notifications that match our recently sent replies
      const filteredNotifications = fetchedNotifications.filter((notif: Notification) => {
        const notifType = notif.type === 'message' ? 'dm' : 'comment';
        const notifId = notif.message_id || notif.comment_id;
        const notifText = notif.text;
        
        // Check if this matches any of our recently sent replies
        return !replySentTracker.some(reply => {
          // Check if type matches and text is similar
          if (reply.type === notifType) {
            // Compare text (case insensitive, ignoring spaces)
            const normalizedReply = reply.text.toLowerCase().trim();
            const normalizedNotif = notifText.toLowerCase().trim();
            
            // Check if it's a match
            return normalizedReply === normalizedNotif || 
                  normalizedNotif.includes(normalizedReply) ||
                  reply.id === notifId;
          }
          return false;
        });
      });
      
      // Keep only the top 10 after filtering
      setNotifications(filteredNotifications.slice(0, 10));
      console.log(`[${new Date().toISOString()}] Fetched notifications for ${userId}:`, 
        filteredNotifications.slice(0, 10).map((n: Notification) => ({ id: n.message_id || n.comment_id, type: n.type, status: n.status })));
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error fetching notifications (attempt ${attempt}/${maxAttempts}):`, err);
      if (attempt < maxAttempts) {
        console.log(`[${new Date().toISOString()}] Retrying fetchNotifications in 2s...`);
        setTimeout(() => fetchNotifications(userId, attempt + 1, maxAttempts), 2000);
      } else {
        setError('Failed to load notifications after retries.');
      }
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

  const handleReply = async (notification: Notification, replyText: string) => {
    if (!igBusinessId || !replyText.trim()) return;

    try {
      if (notification.type === 'message' && notification.sender_id && notification.message_id) {
        await axios.post(`http://localhost:3000/send-dm-reply/${igBusinessId}`, {
          sender_id: notification.sender_id,
          text: replyText,
          message_id: notification.message_id,
        });
        setReplySentTracker(prev => [
          ...prev, 
          {
            text: replyText,
            timestamp: Date.now(),
            type: 'dm' as const,
            id: notification.message_id || ''
          }
        ].slice(-20));
        setNotifications(prev => prev.filter(n => n.message_id !== notification.message_id));
        setToast('DM reply sent!');
      } else if (notification.type === 'comment' && notification.comment_id) {
        await axios.post(`http://localhost:3000/send-comment-reply/${igBusinessId}`, {
          comment_id: notification.comment_id,
          text: replyText,
        });
        setReplySentTracker(prev => [
          ...prev, 
          {
            text: replyText,
            timestamp: Date.now(),
            type: 'comment' as const,
            id: notification.comment_id || ''
          }
        ].slice(-20));
        setNotifications(prev => prev.filter(n => n.comment_id !== notification.comment_id));
        setToast('Comment reply sent!');
      }
    } catch (error: any) {
      console.error('Error sending reply:', error);
      setToast('Failed to send reply.');
      setError(error.response?.data?.error || 'Failed to send reply.');
    }
  };

  const handleIgnore = async (notification: Notification) => {
    if (!igBusinessId || (!notification.message_id && !notification.comment_id)) return;
    try {
      await axios.post(`http://localhost:3000/ignore-notification/${igBusinessId}`, {
        message_id: notification.message_id,
        comment_id: notification.comment_id,
      });
      setNotifications(prev => prev.filter(n =>
        !(
          (notification.message_id && n.message_id === notification.message_id) ||
          (notification.comment_id && n.comment_id === notification.comment_id)
        )
      ));
      setToast('Notification ignored!');
    } catch (error: any) {
      console.error('Error ignoring notification:', error);
      setToast('Failed to ignore notification.');
      setError(error.response?.data?.error || 'Failed to ignore notification.');
    }
  };

  const handleReplyWithAI = async (notification: Notification) => {
    if (!accountHolder) return;
    try {
      await axios.post(`http://localhost:3000/ai-reply/${accountHolder}`,
        notification
      );
      setToast('Sent to AI Manager for reply!');
    } catch (error: any) {
      console.error('Error sending to AI Manager:', error);
      setToast('Failed to send to AI Manager.');
    }
  };

  const refreshAllData = async () => {
    if (!accountHolder) {
      setError('No account holder specified.');
      return;
    }
    try {
      const forceRefresh = firstLoadRef.current;
      const [responsesData, strategiesData, postsData, otherData] = await Promise.all([
        axios.get(`http://localhost:3000/responses/${accountHolder}${forceRefresh ? '?forceRefresh=true' : ''}`).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        axios.get(`http://localhost:3000/${accountType === 'branding' ? 'retrieve-strategies' : 'retrieve-engagement-strategies'}/${accountHolder}${forceRefresh ? '?forceRefresh=true' : ''}`).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        axios.get(`http://localhost:3000/posts/${accountHolder}${forceRefresh ? '?forceRefresh=true' : ''}`).catch(err => {
          if (err.response?.status === 404) return { data: [] };
          throw err;
        }),
        accountType === 'branding' 
          ? Promise.all(
              competitors.map(comp =>
                axios.get(`http://localhost:3000/retrieve/${accountHolder}/${comp}${forceRefresh ? '?forceRefresh=true' : ''}`).catch(err => {
                  if (err.response?.status === 404) {
                    console.warn(`No competitor data found for ${comp}`);
                    return { data: [] };
                  }
                  throw err;
                })
              )
            )
          : axios.get(`http://localhost:3000/news-for-you/${accountHolder}${forceRefresh ? '?forceRefresh=true' : ''}`).catch(err => {
              if (err.response?.status === 404) return { data: [] };
              throw err;
            })
      ]);

      setResponses(responsesData.data);
      setStrategies(strategiesData.data);
      setPosts(postsData.data);
      
      if (accountType === 'branding') {
        // otherData is an array of responses for competitor data
        const competitorResponses = otherData as any[];
        setCompetitorData(competitorResponses.flatMap(res => res.data));
      } else {
        // otherData is a single response for news
        const newsResponse = otherData as any;
        setNews(newsResponse.data || []);
      }

      setError(null);
      if (firstLoadRef.current) {
        firstLoadRef.current = false;
      }
    } catch (error: any) {
      console.error('Error refreshing data:', error);
      setError(error.response?.data?.error || 'Failed to load dashboard data.');
    }
  };

  const setupSSE = (userId: string, attempt = 1) => {
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
      fetchNotifications(userId); // Refresh on connect
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

      console.log(`[${new Date().toISOString()}] SSE message received:`, data);

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
        if (prefix.startsWith(`recommendations/${accountHolder}/`) || prefix.startsWith(`engagement_strategies/${accountHolder}/`)) {
          const endpoint = accountType === 'branding' 
            ? `http://localhost:3000/retrieve-strategies/${accountHolder}`
            : `http://localhost:3000/retrieve-engagement-strategies/${accountHolder}`;
          
          axios.get(endpoint).then(res => {
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
        if (accountType === 'branding' && prefix.startsWith(`competitor_analysis/${accountHolder}/`)) {
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
        if (accountType === 'non-branding' && prefix.startsWith(`NewForYou/${accountHolder}/`)) {
          axios.get(`http://localhost:3000/news-for-you/${accountHolder}`).then(res => {
            setNews(res.data);
            setToast('New news article available!');
          }).catch(err => {
            console.error('Error fetching news:', err);
            setError(err.response?.data?.error || 'Failed to fetch news articles.');
          });
        }
      }

      if (data.event === 'message' || data.event === 'comment') {
        const notifType = data.event === 'message' ? 'dm' : 'comment';
        const notifId = data.data.message_id || data.data.comment_id;
        const notifText = data.data.text;
        
        const isRecentlySent = replySentTracker.some(reply => {
          if (reply.type === notifType) {
            const normalizedReply = reply.text.toLowerCase().trim();
            const normalizedNotif = notifText.toLowerCase().trim();
            
            return normalizedReply === normalizedNotif || 
                  normalizedNotif.includes(normalizedReply) ||
                  reply.id === notifId;
          }
          return false;
        });
        
        if (!isRecentlySent) {
          setNotifications(prev => {
            const updated = [data.data, ...prev.filter(n => 
              n.message_id !== data.data.message_id && 
              n.comment_id !== data.data.comment_id
            )];
            return updated.sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);
          });
          setToast(data.event === 'message' ? 'New Instagram message received!' : 'New Instagram comment received!');
        } else {
          console.log(`[${new Date().toISOString()}] Filtered out own reply from notifications:`, data.data);
        }
      }
    };

    eventSource.onerror = (error) => {
      console.error(`[${new Date().toISOString()}] SSE error (attempt ${attempt}/${maxReconnectAttempts}):`, error);
      eventSource.close();
      eventSourceRef.current = null;

      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current += 1;
        const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts.current);
        setTimeout(() => setupSSE(userId, attempt + 1), delay);
      } else {
        setError('Failed to reconnect to server updates. Will try again in 5 minutes.');
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
      fetchIgBusinessId();
    }
  }, [accountHolder, competitors]);

  useEffect(() => {
    if (igBusinessId) {
      fetchNotifications(igBusinessId); // Initial fetch
      setupSSE(igBusinessId);           // Event-driven updates

      // Fallback polling every 5 minutes (300,000 ms)
      const interval = setInterval(() => {
        fetchNotifications(igBusinessId);
      }, 300000); // 5 minutes

      return () => clearInterval(interval);
    }
  }, [igBusinessId]);

  useEffect(() => {
    console.log(`[${new Date().toISOString()}] isSchedulerOpen: ${isSchedulerOpen}`);
  }, [isSchedulerOpen]);

  useEffect(() => {
    console.log(`[${new Date().toISOString()}] isInsightsOpen: ${isInsightsOpen}`);
  }, [isInsightsOpen]);

  useEffect(() => {
    if (igBusinessId) {
      // Update the location state with userId when available
      const currentState = window.history.state?.usr?.state || {};
      const newState = { ...currentState, userId: igBusinessId };
      
      // Only update if needed to avoid unnecessary history entries
      if (currentState.userId !== igBusinessId) {
        window.history.replaceState(
          { 
            ...window.history.state,
            usr: { ...window.history.state?.usr, state: newState }
          }, 
          '', 
          window.location.pathname
        );
        console.log(`[${new Date().toISOString()}] Updated location state with userId: ${igBusinessId}`);
      }
    }
  }, [igBusinessId]);

  const handleInstagramConnected = (graphId: string, userId: string) => {
    if (!userId) {
      console.error(`[${new Date().toISOString()}] Instagram connection failed: userId is undefined`);
      setToast('Failed to connect Instagram: Missing user ID');
      return;
    }
    
    console.log(`[${new Date().toISOString()}] Instagram connected via InstagramConnect: graph ID: ${graphId}, user ID: ${userId}`);
    
    setToast('Instagram account connected successfully!');
  };

  const handleOpenScheduler = () => {
    console.log(`[${new Date().toISOString()}] Opening PostScheduler for user ${igBusinessId}`);
    setIsSchedulerOpen(true);
  };

  const handleOpenInsights = () => {
    console.log(`[${new Date().toISOString()}] Opening InsightsModal for user ${igBusinessId}`);
    setIsInsightsOpen(true);
  };

  const handleOpenGoalModal = () => {
    setIsGoalModalOpen(true);
  };

  // Clean old entries from reply tracker (older than 10 minutes)
  useEffect(() => {
    const cleanInterval = setInterval(() => {
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      setReplySentTracker(prev => prev.filter(reply => reply.timestamp > tenMinutesAgo));
    }, 60000); // Check every minute
    
    return () => clearInterval(cleanInterval);
  }, []);

  if (!accountHolder) {
    return <div className="error-message">Please specify an account holder to load the dashboard.</div>;
  }

  const formatCount = (count: number | undefined) => {
    if (count === undefined) return 'N/A';
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
  };

  // Add debug log before return
  console.log('DmsComments username prop:', accountHolder);
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
                  <div className="profile-actions">
                    <InstagramConnect onConnected={handleInstagramConnected} />
                    
                    <InstagramRequiredButton
                      isConnected={!!igBusinessId}
                      onClick={handleOpenInsights}
                      className="insta-btn insights"
                      style={{
                        background: 'linear-gradient(90deg, #ff2e63, #00ffcc)',
                        color: '#e0e0ff',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: '1px solid #ff2e63',
                        zIndex: 20,
                      }}
                    >
                      Insights
                    </InstagramRequiredButton>
                    
                    <InstagramRequiredButton
                      isConnected={!!igBusinessId}
                      onClick={handleOpenScheduler}
                      className="insta-btn connect"
                      style={{
                        background: 'linear-gradient(90deg, #007bff, #00ffcc)',
                        color: '#e0e0ff',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: '1px solid #00ffcc',
                        zIndex: 20,
                      }}
                    >
                      Schedule Post
                    </InstagramRequiredButton>
                    
                    <InstagramRequiredButton
                      isConnected={!!igBusinessId}
                      onClick={handleOpenGoalModal}
                      className="insta-btn connect"
                      style={{
                        background: 'linear-gradient(90deg, #00ffcc, #007bff)',
                        color: '#e0e0ff',
                        padding: '8px 16px',
                        borderRadius: '6px',
                        border: '1px solid #00ffcc',
                        zIndex: 20,
                        marginLeft: '10px',
                      }}
                    >
                      Goal
                    </InstagramRequiredButton>
                  </div>
                </div>
              )}
              <div className="chart-placeholder"></div>
            </div>
          </div>

          <div className="notifications">
            <h2>Notifications <span className="badge">{notifications.length || 0} new!!!</span></h2>
            <DmsComments 
              notifications={notifications} 
              onReply={handleReply} 
              onIgnore={handleIgnore} 
              onRefresh={() => igBusinessId && fetchNotifications(igBusinessId)} 
              onReplyWithAI={handleReplyWithAI}
              username={accountHolder}
              onIgnoreAIReply={async (pair) => {
                try {
                  await fetch(`http://localhost:3000/ignore-ai-reply/${accountHolder}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ replyKey: pair.replyKey, reqKey: pair.reqKey }),
                  });
                  setRefreshKey(prev => prev + 1);
                } catch (err) {
                  setToast('Failed to ignore AI reply.');
                }
              }}
              refreshKey={refreshKey}
              igBusinessId={igBusinessId}
            />
          </div>

          <div className="post-cooked">
            <PostCooked
              username={accountHolder}
              profilePicUrl={profileInfo?.profilePicUrlHD ? `http://localhost:3000/proxy-image?url=${encodeURIComponent(profileInfo.profilePicUrlHD)}` : ''}
              posts={posts}
              userId={igBusinessId || undefined}
            />
          </div>

          <div className="strategies">
            <h2>Our Strategies <span className="badge">{strategies.length || 3} unseen!!!</span></h2>
            <OurStrategies accountHolder={accountHolder} accountType={accountType} />
          </div>

          <div className="competitor-analysis">
            {accountType === 'branding' ? (
              <>
                <h2>Competitor Analysis <span className="badge">{competitorData.length || 5} unseen!!!</span></h2>
                <Cs_Analysis accountHolder={accountHolder} competitors={competitors} />
              </>
            ) : (
              <>
                <h2>News For You <span className="badge">{news.length || 5} new articles!!!</span></h2>
                <NewsForYou accountHolder={accountHolder} />
              </>
            )}
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
      {isSchedulerOpen && (
        <PostScheduler userId={igBusinessId!} onClose={() => {
          console.log(`[${new Date().toISOString()}] Closing PostScheduler`);
          setIsSchedulerOpen(false);
        }} />
      )}
      {isInsightsOpen && (
        <InsightsModal userId={igBusinessId!} onClose={() => {
          console.log(`[${new Date().toISOString()}] Closing InsightsModal`);
          setIsInsightsOpen(false);
        }} />
      )}
      {isGoalModalOpen && (
        <GoalModal username={accountHolder} onClose={() => setIsGoalModalOpen(false)} />
      )}
    </motion.div>
  );
};

export default Dashboard;