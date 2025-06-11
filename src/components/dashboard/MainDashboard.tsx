import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import './MainDashboard.css';
import { useInstagram } from '../../context/InstagramContext';
import { useTwitter } from '../../context/TwitterContext';
import { useAuth } from '../../context/AuthContext';
import PostScheduler from '../instagram/PostScheduler';
import TwitterCompose from '../twitter/TwitterCompose';

interface PlatformData {
  id: string;
  name: string;
  icon: string;
  claimed: boolean;   // User has submitted entry details and accessed platform
  connected: boolean; // User has connected their social account
  notifications: {
    total: number;
    breakdown: {
      cs_analysis: number;
      our_strategies: number;
      dms_comments: number;
      cooked_posts: number;
    };
  };
  route: string;
  characterLimit?: number;
  supportsImages?: boolean;
  supportsVideo?: boolean;
}

// Content data structure for instant posts
interface PostContent {
  text: string;
  images: File[];
  platformIds: string[];
  scheduleDate: Date | null;
}

const MainDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'usage'>('overview');
  const { isConnected: isInstagramConnected, userId: instagramUserId, hasAccessed: hasAccessedInstagram = false } = useInstagram();
  const { isConnected: isTwitterConnected, userId: twitterUserId, hasAccessed: hasAccessedTwitter = false } = useTwitter();
  const { currentUser } = useAuth();
  const [userName, setUserName] = useState<string>('');
  const [showInstantPostModal, setShowInstantPostModal] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Platform-specific modals
  const [showInstagramScheduler, setShowInstagramScheduler] = useState<boolean>(false);
  const [showTwitterComposer, setShowTwitterComposer] = useState<boolean>(false);
  
  // Real-time notification counts
  const [realTimeNotifications, setRealTimeNotifications] = useState<Record<string, number>>({
    instagram: 0,
    twitter: 0,
    facebook: 0,
    linkedin: 0
  });
  
  // Viewed content tracking
  const [viewedContent, setViewedContent] = useState<Record<string, Set<string>>>({
    instagram: new Set(),
    twitter: new Set(),
    facebook: new Set(),
    linkedin: new Set()
  });
  
  const [postContent, setPostContent] = useState<PostContent>({
    text: '',
    images: [],
    platformIds: [],
    scheduleDate: null
  });
  
  // Fetch user's name from authentication
  useEffect(() => {
    if (currentUser) {
      // Get displayName or email from the currentUser object
      const name = currentUser.displayName || currentUser.email?.split('@')[0] || 'User';
      setUserName(name);
    }
  }, [currentUser]);

  // Check localStorage for platform access status for platforms not managed by contexts
  const hasAccessedFacebook = currentUser?.uid 
    ? localStorage.getItem(`facebook_accessed_${currentUser.uid}`) === 'true'
    : false;
    
  const hasAccessedLinkedIn = currentUser?.uid
    ? localStorage.getItem(`linkedin_accessed_${currentUser.uid}`) === 'true'
    : false;

  // Check localStorage directly for Instagram and Twitter access status as a fallback
  const instagramAccessedInLocalStorage = currentUser?.uid 
    ? localStorage.getItem(`instagram_accessed_${currentUser.uid}`) === 'true' 
    : false;
    
  const twitterAccessedInLocalStorage = currentUser?.uid
    ? localStorage.getItem(`twitter_accessed_${currentUser.uid}`) === 'true'
    : false;

  // Function to fetch real-time notification counts for all platforms
  const fetchRealTimeNotifications = async () => {
    if (!currentUser?.uid) return;
    
    const platforms = ['instagram', 'twitter', 'facebook', 'linkedin'];
    const counts: Record<string, number> = {};
    
    for (const platform of platforms) {
      try {
        let userId = null;
        if (platform === 'instagram' && instagramUserId) userId = instagramUserId;
        if (platform === 'twitter' && twitterUserId) userId = twitterUserId;
        
        let totalCount = 0;
        
        // Only count notifications if platform is claimed (accessed)
        const isClaimedPlatform = localStorage.getItem(`${platform}_accessed_${currentUser.uid}`) === 'true';
        
        if (isClaimedPlatform) {
          // Real-time notifications (DMs/comments) - only if connected
          if (userId) {
            try {
              const response = await fetch(`http://localhost:3000/events-list/${userId}?platform=${platform}`);
              if (response.ok) {
                const notifications = await response.json();
                totalCount += notifications.length;
              }
            } catch (err) {
              console.warn(`Failed to fetch ${platform} notifications:`, err);
            }
          }
          
          // Get a real username for this platform instead of using dummy
          const platformUsername = localStorage.getItem(`${platform}_username_${currentUser.uid}`);
          if (platformUsername) {
            // Fetch strategies count
            try {
              const strategiesResponse = await fetch(`http://localhost:3000/retrieve-strategies/${platformUsername}?platform=${platform}`);
              if (strategiesResponse.ok) {
                const strategies = await strategiesResponse.json();
                // Count unseen strategies
                const viewedKey = `viewed_strategies_${platform}_${platformUsername}`;
                const viewedStrategies = JSON.parse(localStorage.getItem(viewedKey) || '[]');
                const unseenStrategies = strategies.filter((s: any) => !viewedStrategies.includes(s.key));
                totalCount += unseenStrategies.length;
              }
            } catch (err) {
              // Ignore strategy fetch errors
            }
            
            // Fetch posts count  
            try {
              const postsResponse = await fetch(`http://localhost:3000/posts/${platformUsername}?platform=${platform}`);
              if (postsResponse.ok) {
                const posts = await postsResponse.json();
                // Count unseen posts
                const viewedKey = `viewed_posts_${platform}_${platformUsername}`;
                const viewedPosts = JSON.parse(localStorage.getItem(viewedKey) || '[]');
                const unseenPosts = posts.filter((p: any) => !viewedPosts.includes(p.key));
                totalCount += unseenPosts.length;
              }
            } catch (err) {
              // Ignore posts fetch errors
            }
            
            // Fetch competitor analysis count
            try {
              const accountInfoResponse = await fetch(`http://localhost:3000/retrieve-account-info/${platformUsername}?platform=${platform}`);
              if (accountInfoResponse.ok) {
                const accountInfo = await accountInfoResponse.json();
                const competitors = accountInfo.competitors || [];
                
                if (competitors.length > 0) {
                  const competitorResponse = await fetch(`http://localhost:3000/retrieve-multiple/${platformUsername}?competitors=${competitors.join(',')}&platform=${platform}`);
                  if (competitorResponse.ok) {
                    const competitorData = await competitorResponse.json();
                    // Count unseen competitor analysis
                    const viewedKey = `viewed_competitor_${platform}_${platformUsername}`;
                    const viewedCompetitor = JSON.parse(localStorage.getItem(viewedKey) || '[]');
                    const unseenCompetitor = competitorData.filter((c: any) => !viewedCompetitor.includes(c.key || `${c.competitor}_${c.timestamp}`));
                    totalCount += unseenCompetitor.length;
                  }
                }
              }
            } catch (err) {
              // Ignore competitor fetch errors
            }
          }
        }
        
        counts[platform] = totalCount;
      } catch (error) {
        console.warn(`Failed to fetch notifications for ${platform}:`, error);
        counts[platform] = 0;
      }
    }
    
    setRealTimeNotifications(counts);
  };

  // Effect to fetch real-time notifications on mount and when connections change
  useEffect(() => {
    fetchRealTimeNotifications();
    
    // Set up interval to refresh every 30 seconds
    const interval = setInterval(fetchRealTimeNotifications, 30000);
    
    return () => clearInterval(interval);
  }, [currentUser?.uid, instagramUserId, twitterUserId, isInstagramConnected, isTwitterConnected]);

  // Claimed platforms - based on whether user has accessed the platform dashboard
  // Connected platforms - based on whether user has connected their social media account
  const [platforms, setPlatforms] = useState<PlatformData[]>([
    {
      id: 'instagram',
      name: 'Instagram',
      icon: '/icons/instagram.svg',
      claimed: hasAccessedInstagram || instagramAccessedInLocalStorage, // Check both context and localStorage
      connected: isInstagramConnected,
      notifications: {
        total: 0, // Will be updated by real-time data
        breakdown: {
          cs_analysis: 0,
          our_strategies: 0,
          dms_comments: 0,
          cooked_posts: 0
        }
      },
      route: '/dashboard',
      characterLimit: 2200,
      supportsImages: true,
      supportsVideo: true
    },
    {
      id: 'twitter',
      name: 'Twitter',
      icon: '/icons/twitter.svg',
      claimed: hasAccessedTwitter || twitterAccessedInLocalStorage, // Check both context and localStorage
      connected: isTwitterConnected,
      notifications: {
        total: 0, // Will be updated by real-time data
        breakdown: {
          cs_analysis: 0,
          our_strategies: 0,
          dms_comments: 0,
          cooked_posts: 0
        }
      },
      route: '/twitter-dashboard',
      characterLimit: 280,
      supportsImages: true,
      supportsVideo: true
    },
    {
      id: 'facebook',
      name: 'Facebook',
      icon: '/icons/facebook.svg',
      claimed: hasAccessedFacebook,
      connected: false, // No context for Facebook yet
      notifications: {
        total: 0, // Will be updated by real-time data
        breakdown: {
          cs_analysis: 0,
          our_strategies: 0,
          dms_comments: 0,
          cooked_posts: 0
        }
      },
      route: '/facebook-dashboard',
      characterLimit: 63206,
      supportsImages: true,
      supportsVideo: true
    },
    {
      id: 'linkedin',
      name: 'LinkedIn',
      icon: '/icons/linkedin.svg',
      claimed: hasAccessedLinkedIn,
      connected: false, // No context for LinkedIn yet
      notifications: {
        total: 0, // Will be updated by real-time data
        breakdown: {
          cs_analysis: 0,
          our_strategies: 0,
          dms_comments: 0,
          cooked_posts: 0
        }
      },
      route: '/linkedin-dashboard',
      characterLimit: 3000,
      supportsImages: true,
      supportsVideo: true
    }
  ]);

  // Get only connected platforms
  const connectedPlatforms = platforms.filter(p => p.connected);

  // Effect to update connection status and real-time notification counts
  useEffect(() => {
    setPlatforms(prev => 
      prev.map(platform => {
        const platformNotificationCount = realTimeNotifications[platform.id] || 0;
        
        if (platform.id === 'instagram') {
          return { 
            ...platform, 
            connected: isInstagramConnected,
            notifications: {
              ...platform.notifications,
              total: platform.claimed ? platformNotificationCount : 0
            }
          };
        }
        if (platform.id === 'twitter') {
          return { 
            ...platform, 
            connected: isTwitterConnected,
            notifications: {
              ...platform.notifications,
              total: platform.claimed ? platformNotificationCount : 0
            }
          };
        }
        
        // For Facebook and LinkedIn, use real-time counts if claimed
        return {
          ...platform,
          notifications: {
            ...platform.notifications,
            total: platform.claimed ? platformNotificationCount : 0
          }
        };
      })
    );
  }, [isInstagramConnected, isTwitterConnected, realTimeNotifications]);

  // Add an effect to recheck localStorage on focus, this helps when returning from platform pages
  useEffect(() => {
    const handleFocus = () => {
      // If user has returned to this page, recheck localStorage for each platform
      if (currentUser?.uid) {
        const instagramAccessed = localStorage.getItem(`instagram_accessed_${currentUser.uid}`) === 'true';
        const twitterAccessed = localStorage.getItem(`twitter_accessed_${currentUser.uid}`) === 'true';
        const facebookAccessed = localStorage.getItem(`facebook_accessed_${currentUser.uid}`) === 'true';
        const linkedinAccessed = localStorage.getItem(`linkedin_accessed_${currentUser.uid}`) === 'true';
        
        // Update platforms with fresh localStorage values and refresh notifications
        setPlatforms(prev => 
          prev.map(p => {
            const wasClaimedBefore = p.claimed;
            let newClaimed = p.claimed;
            
            if (p.id === 'instagram' && instagramAccessed) newClaimed = true;
            if (p.id === 'twitter' && twitterAccessed) newClaimed = true;
            if (p.id === 'facebook' && facebookAccessed) newClaimed = true;
            if (p.id === 'linkedin' && linkedinAccessed) newClaimed = true;
            
            return { 
              ...p, 
              claimed: newClaimed,
              notifications: {
                ...p.notifications,
                total: newClaimed ? realTimeNotifications[p.id] || 0 : 0
              }
            };
          })
        );
        
        // Refresh notification counts
        fetchRealTimeNotifications();
      }
    };

    // Check on initial mount
    handleFocus();
    
    // Also check when window regains focus
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentUser?.uid, realTimeNotifications]);

  // Sort platforms so claimed ones appear first
  const sortedPlatforms = [...platforms].sort((a, b) => {
    if (a.claimed && !b.claimed) return -1;
    if (!a.claimed && b.claimed) return 1;
    return 0;
  });
  
  // Restore the markPlatformAccessed function
  const markPlatformAccessed = (platformId: string) => {
    if (!currentUser?.uid) return;
    
    localStorage.setItem(`${platformId}_accessed_${currentUser.uid}`, 'true');
    
    setPlatforms(prev => 
      prev.map(p => {
        if (p.id === platformId) {
          return { 
            ...p, 
            claimed: true,
            notifications: {
              ...p.notifications,
              total: p.notifications.breakdown.cs_analysis + 
                     p.notifications.breakdown.our_strategies + 
                     p.notifications.breakdown.dms_comments + 
                     p.notifications.breakdown.cooked_posts
            }
          };
        }
        return p;
      })
    );
  };

  const navigateToPlatform = (platform: PlatformData) => {
    // Navigate to setup pages exactly like top bar navigation
    // This ensures the username from the entry card is used consistently
    switch(platform.id) {
      case 'instagram':
        navigate('/instagram');
        break;
      case 'twitter':
        navigate('/twitter');
        break;
      case 'facebook':
        navigate('/facebook');
        break;
      case 'linkedin':
        navigate('/linkedin');
        break;
      default:
        navigate(platform.route);
    }
  };

  // Add a function to navigate to the entry setup
  const navigateToSetup = (platformId: string) => {
    // Set a flag in localStorage to indicate that this platform should be marked as acquired upon successful submission
    if (currentUser?.uid) {
      localStorage.setItem(`mark_${platformId}_pending_${currentUser.uid}`, 'true');
    }

    if (platformId === 'instagram') {
      navigate('/instagram');
    } else if (platformId === 'twitter') {
      navigate('/twitter');
    } else if (platformId === 'facebook') {
      navigate('/facebook');
    } else if (platformId === 'linkedin') {
      navigate('/linkedin');
    }
  };

  const handleConnectionButtonClick = (platform: PlatformData) => {
    if (!platform.connected) {
      // Navigate to connection page for this platform
      if (platform.id === 'instagram') {
        navigate('/instagram/connect');
      } else if (platform.id === 'twitter') {
        navigate('/twitter/connect');
      } else if (platform.id === 'facebook') {
        navigate('/facebook');
      } else if (platform.id === 'linkedin') {
        navigate('/linkedin');
      }
    }
  };
  
  // Open the file selector for images
  const handleImageUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Handle image file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newImages = Array.from(files);
      setPostContent(prev => ({
        ...prev,
        images: [...prev.images, ...newImages]
      }));
    }
  };
  
  // Remove an image from the post content
  const removeImage = (index: number) => {
    setPostContent(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };
  
  // Toggle a platform selection for posting
  const togglePlatformSelection = (platformId: string) => {
    setPostContent(prev => {
      if (prev.platformIds.includes(platformId)) {
        return {
          ...prev,
          platformIds: prev.platformIds.filter(id => id !== platformId)
        };
      } else {
        return {
          ...prev,
          platformIds: [...prev.platformIds, platformId]
        };
      }
    });
  };
  
  // Calculate remaining characters based on selected platforms
  const getRemainingCharacters = () => {
    if (postContent.platformIds.length === 0) return null;
    
    const selectedPlatforms = platforms.filter(p => postContent.platformIds.includes(p.id));
    if (selectedPlatforms.length === 0) return null;
    
    const minCharLimit = Math.min(...selectedPlatforms.map(p => p.characterLimit || Infinity));
    return minCharLimit === Infinity ? null : minCharLimit - postContent.text.length;
  };
  
  // Open the instant post modal without checking for connected platforms
  const openInstantPostModal = () => {
    // Pre-select connected platforms
    const connectedPlatformIds = platforms
      .filter(p => p.connected)
      .map(p => p.id);
    
    setPostContent({
      text: '',
      images: [],
      platformIds: connectedPlatformIds,
      scheduleDate: null
    });
    
    setShowInstantPostModal(true);
  };
  
  // Handle instant post submission by routing to appropriate platform-specific schedulers
  const handleInstantPost = () => {
    // Verify post has content
    if (postContent.text.trim() === '' && postContent.images.length === 0) {
      alert("Please enter some text or add an image for your post.");
      return;
    }
    
    // Get selected platforms that are connected
    const selectedPlatforms = platforms.filter(p => 
      postContent.platformIds.includes(p.id) && p.connected
    );
    
    // If no platforms are connected, save as draft
    if (selectedPlatforms.length === 0) {
      alert("Your post has been saved as a draft.");
      setShowInstantPostModal(false);
      return;
    }
    
    // Close the instant post modal first
    setShowInstantPostModal(false);
    
    // Process each selected platform
    selectedPlatforms.forEach(platform => {
      switch(platform.id) {
        case 'instagram':
          if (instagramUserId) {
            console.log('Scheduling post to Instagram');
            // Only schedule if there's an image (Instagram requires an image)
            if (postContent.images.length > 0) {
              setShowInstagramScheduler(true);
            } else {
              alert("Instagram posts require at least one image. Please add an image for Instagram.");
            }
          } else {
            console.error('Instagram userId is missing, cannot schedule post');
          }
          break;
          
        case 'twitter':
          if (twitterUserId) {
            console.log('Scheduling post to Twitter');
            setShowTwitterComposer(true);
          } else {
            console.error('Twitter userId is missing, cannot schedule post');
          }
          break;
          
        case 'facebook':
          console.log('Facebook posting not yet implemented');
          alert("Facebook integration is not yet available.");
          break;
          
        case 'linkedin':
          console.log('LinkedIn posting not yet implemented');
          alert("LinkedIn integration is not yet available.");
          break;
          
        default:
          console.log(`No specific handler for ${platform.name} yet`);
      }
    });
  };

  // Handle change of schedule date
  const handleScheduleDateChange = (date: Date | null) => {
    setPostContent(prev => ({
      ...prev,
      scheduleDate: date
    }));
  };

  // Handle notification click to mark content as viewed
  const handleNotificationClick = (platformId: string) => {
    setViewedContent(prev => ({
      ...prev,
      [platformId]: new Set() // Reset viewed content when clicking notification
    }));
    
    // Navigate to platform
    const platform = platforms.find(p => p.id === platformId);
    if (platform?.claimed) {
      navigateToPlatform(platform);
    } else {
      navigateToSetup(platformId);
    }
  };

  return (
    <div className="dashboard-page">
      <div className="welcome-banner">
        <h2>Welcome <span className="user-name">{userName}</span>!</h2>
      </div>
      
      <motion.div
        className="main-dashboard-wrapper"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="main-dashboard-header">
          <h1>Account Dashboard</h1>
          <div className="tabs">
            <button 
              className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              Overview
            </button>
            <button 
              className={`tab ${activeTab === 'usage' ? 'active' : ''}`}
              onClick={() => setActiveTab('usage')}
            >
              Usage
            </button>
          </div>
        </div>

        {activeTab === 'overview' && (
          <>
            <div className="instant-post-section">
              <button 
                className="instant-post-button"
                onClick={openInstantPostModal}
                title="Create a post for your platforms"
              >
                <div className="instant-post-icon">
                  <svg viewBox="0 0 24 24">
                    <path d="M18,6V17.5A3.5,3.5 0 0,1 14.5,21A3.5,3.5 0 0,1 11,17.5A3.5,3.5 0 0,1 14.5,14C15,14 15.5,14.1 16,14.3V7.8L8,10V15.5A3.5,3.5 0 0,1 4.5,19A3.5,3.5 0 0,1 1,15.5A3.5,3.5 0 0,1 4.5,12C5,12 5.5,12.1 6,12.3V7L18,4Z" />
                  </svg>
                </div>
                <div className="instant-post-text">
                  <h3>Instant Post</h3>
                  <p>Create one post for all your connected platforms</p>
                </div>
                {connectedPlatforms.length > 0 && (
                  <div className="connected-platforms-count">
                    <span>{connectedPlatforms.length} connected</span>
                  </div>
                )}
              </button>
            </div>
            
            <div className="platforms-container">
              {sortedPlatforms.map(platform => (
                <div 
                  key={platform.id} 
                  className={`platform-row ${platform.claimed ? 'claimed' : 'unclaimed'}`}
                >
                  <div 
                    className="clickable-area"
                    onClick={() => platform.claimed ? navigateToPlatform(platform) : navigateToSetup(platform.id)}
                  >
                    <div className="platform-icon">
                      <img 
                        src={platform.icon} 
                        alt={`${platform.name} icon`}
                        onError={(e) => {
                          // Fallback for missing icons
                          const target = e.target as HTMLImageElement;
                          target.onerror = null; 
                          target.src = `/icons/default.svg`;
                        }}
                      />
                    </div>
                    
                    <div className="platform-name">
                      {platform.name}
                    </div>
                  </div>
                  
                  <div className="platform-info">
                    <div className="status-indicators">
                      <div 
                        className={`status-indicator ${platform.claimed ? 'claimed' : 'unclaimed'}`}
                      >
                        {platform.claimed ? 'Acquired' : 'Not Acquired'}
                      </div>
                      
                      <div 
                        className={`connection-indicator ${platform.connected ? 'connected' : 'disconnected'}`}
                        onClick={() => !platform.connected && handleConnectionButtonClick(platform)}
                        style={{ cursor: platform.connected ? 'default' : 'pointer' }}
                      >
                        {platform.connected ? 'Connected' : 'Connect'}
                      </div>
                    </div>
                  </div>
                  
                  {platform.claimed && platform.notifications.total > 0 && (
                    <div className="notification-badge-container">
                      <div 
                        className="notification-badge"
                        onClick={() => handleNotificationClick(platform.id)}
                      >
                        <svg className="notification-bell-icon" viewBox="0 0 24 24" width="16" height="16" style={{marginRight: '4px'}}>
                          <path d="M12 22c1.1 0 2-.9 2-2h-4a2 2 0 0 0 2 2zm6-6V11c0-3.07-1.63-5.64-5-6.32V4a1 1 0 1 0-2 0v.68C7.63 5.36 6 7.92 6 11v5l-1.29 1.29A1 1 0 0 0 6 19h12a1 1 0 0 0 .71-1.71L18 16zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z" fill="#fff"/>
                        </svg>
                        <span className="notification-number">{platform.notifications.total}</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            
            {showInstantPostModal && (
              <div className="modal-overlay">
                <div className="modal-content">
                  <h3>Post to Your Platforms</h3>
                  
                  {/* Platform Selection */}
                  <div className="platform-selection">
                    <h4>Select platforms:</h4>
                    <div className="platform-checkboxes">
                      {platforms
                        .filter(platform => platform.connected)
                        .map(platform => (
                          <div 
                            key={platform.id} 
                            className={`platform-checkbox ${postContent.platformIds.includes(platform.id) ? 'selected' : ''}`}
                            onClick={() => togglePlatformSelection(platform.id)}
                          >
                            <img 
                              src={platform.icon} 
                              alt={platform.name}
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.onerror = null;
                                target.src = "/icons/default.svg";
                              }}
                            />
                            <span>{platform.name}</span>
                            <div className="checkbox-indicator">
                              {postContent.platformIds.includes(platform.id) && (
                                <svg viewBox="0 0 24 24">
                                  <path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z" />
                                </svg>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                    
                    {platforms.filter(p => p.connected).length === 0 && (
                      <div className="no-connected-platforms">
                        <p>No connected platforms. Your post will be saved as draft.</p>
                        <div className="connect-platforms-actions">
                          <button 
                            className="connect-platform-button"
                            onClick={() => {
                              setShowInstantPostModal(false);
                              navigate('/instagram/connect');
                            }}
                          >
                            Connect Instagram
                          </button>
                          <button 
                            className="connect-platform-button"
                            onClick={() => {
                              setShowInstantPostModal(false);
                              navigate('/twitter/connect');
                            }}
                          >
                            Connect Twitter
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  {/* Text Content */}
                  <div className="post-content-section">
                    <textarea 
                      placeholder="What would you like to share?" 
                      className="instant-post-textarea"
                      rows={5}
                      value={postContent.text}
                      onChange={(e) => setPostContent(prev => ({...prev, text: e.target.value}))}
                    ></textarea>
                    
                    {getRemainingCharacters() !== null && (
                      <div className={`character-counter ${getRemainingCharacters()! < 20 ? 'warning' : ''}`}>
                        {getRemainingCharacters()} characters remaining
                      </div>
                    )}
                  </div>
                  
                  {/* Schedule Options */}
                  <div className="schedule-section">
                    <h4>When to post:</h4>
                    <div className="date-picker-wrapper">
                      <DatePicker
                        selected={postContent.scheduleDate}
                        onChange={handleScheduleDateChange}
                        showTimeSelect
                        dateFormat="Pp"
                        minDate={new Date()}
                        placeholderText="Schedule for later (optional)"
                        className="schedule-datepicker"
                      />
                      {postContent.scheduleDate && (
                        <button 
                          className="clear-date-btn"
                          onClick={() => handleScheduleDateChange(null)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    <div className="schedule-note">
                      {postContent.scheduleDate 
                        ? `Your post will be scheduled for ${postContent.scheduleDate.toLocaleString()}`
                        : "Your post will be published immediately"}
                    </div>
                  </div>
                  
                  {/* Image Upload */}
                  <div className="image-upload-section">
                    <div className="upload-button" onClick={handleImageUploadClick}>
                      <svg viewBox="0 0 24 24">
                        <path d="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z" />
                      </svg>
                      <span>Add Images</span>
                    </div>
                    
                    <input
                      type="file"
                      ref={fileInputRef}
                      multiple
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleFileChange}
                    />
                    
                    {postContent.images.length > 0 && (
                      <div className="image-previews">
                        {postContent.images.map((image, index) => (
                          <div key={index} className="image-preview">
                            <img src={URL.createObjectURL(image)} alt={`Preview ${index}`} />
                            <button 
                              className="remove-image" 
                              onClick={(e) => {
                                e.stopPropagation();
                                removeImage(index);
                              }}
                            >
                              <svg viewBox="0 0 24 24">
                                <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="modal-buttons">
                    <button 
                      className="cancel-button"
                      onClick={() => setShowInstantPostModal(false)}
                    >
                      Cancel
                    </button>
                    <button 
                      className="post-button"
                      disabled={postContent.text.trim() === '' && postContent.images.length === 0}
                      onClick={handleInstantPost}
                    >
                      {postContent.scheduleDate ? 'Schedule Post' : 'Post Now'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            {/* Platform-specific post components */}
            {showInstagramScheduler && instagramUserId && (
              <PostScheduler 
                userId={instagramUserId}
                onClose={() => setShowInstagramScheduler(false)}
              />
            )}
            
            {showTwitterComposer && twitterUserId && (
              <TwitterCompose 
                userId={twitterUserId}
                onClose={() => setShowTwitterComposer(false)}
              />
            )}
          </>
        )}
        
        {activeTab === 'usage' && (
          <div className="usage-container">
            <div className="usage-header">
              <h2>Platform Usage</h2>
            </div>
            
            <div className="usage-stats">
              <div className="usage-stat">
                <div className="stat-icon claimed">
                  <svg viewBox="0 0 24 24">
                    <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M11,16.5L18,9.5L16.59,8.09L11,13.67L7.91,10.59L6.5,12L11,16.5Z" />
                  </svg>
                </div>
                <div className="stat-details">
                  <h4>Claimed Platforms</h4>
                  <p className="stat-value">{platforms.filter(p => p.claimed).length}</p>
                </div>
              </div>
              
              <div className="usage-stat">
                <div className="stat-icon connected">
                  <svg viewBox="0 0 24 24">
                    <path d="M8,3A2,2 0 0,0 6,5V9A2,2 0 0,1 4,11H3V13H4A2,2 0 0,1 6,15V19A2,2 0 0,0 8,21H10V19H8V14A2,2 0 0,0 6,12A2,2 0 0,0 8,10V5H10V3M16,3A2,2 0 0,1 18,5V9A2,2 0 0,0 20,11H21V13H20A2,2 0 0,0 18,15V19A2,2 0 0,1 16,21H14V19H16V14A2,2 0 0,1 18,12A2,2 0 0,1 16,10V5H14V3H16Z" />
                  </svg>
                </div>
                <div className="stat-details">
                  <h4>Connected APIs</h4>
                  <p className="stat-value">{platforms.filter(p => p.connected).length}</p>
                </div>
              </div>
              
              <div className="usage-stat">
                <div className="stat-icon posts">
                  <svg viewBox="0 0 24 24">
                    <path d="M20,2H4A2,2 0 0,0 2,4V22L6,18H20A2,2 0 0,0 22,16V4A2,2 0 0,0 20,2M6,9H18V11H6M14,14H6V12H14M18,8H6V6H18" />
                  </svg>
                </div>
                <div className="stat-details">
                  <h4>Created Posts</h4>
                  <p className="stat-value">{
                    platforms.filter(p => p.claimed).reduce((total, p) => {
                      return total + p.notifications.breakdown.cooked_posts;
                    }, 0)
                  }</p>
                </div>
              </div>
              
              <div className="usage-stat">
                <div className="stat-icon ai">
                  <svg viewBox="0 0 24 24">
                    <path d="M21,15.61L19.59,17.02L17.7,15.13L16.29,16.54L18.17,18.44L16.76,19.85L14.87,17.95L13.46,19.36L15.35,21.25L13.94,22.66L9.17,17.88L17.88,9.17L22.66,13.94L21.25,15.35L19.35,13.46L17.95,14.87L19.84,16.76L18.43,18.17L16.54,16.29L15.13,17.7L17.02,19.59L15.61,21L13.71,19.1L12.3,20.51L14.19,22.41L12.78,23.82L8,19.05V21H3V16L4.95,17.95L6.36,16.54L4.46,14.64L5.87,13.23L7.77,15.13L9.18,13.72L7.28,11.82L8.69,10.41L10.59,12.31L12,10.9L10.1,9L11.51,7.59L13.41,9.49L14.82,8.08L12.92,6.18L14.33,4.77L18.55,9L19.96,7.59L15.75,3.38L17.16,1.97L22.25,7.06L21.26,8.04L19.37,6.15L17.96,7.56L19.85,9.46L18.44,10.87L16.55,8.97L15.14,10.38L17.03,12.28L15.62,13.69L13.73,11.79L12.32,13.2L14.21,15.1L12.8,16.51L10.91,14.61L9.5,16.02L11.39,17.92L9.98,19.33L8.09,17.43L6.68,18.84L8.57,20.74L7.16,22.15L3,18V13H1V8H3V3H8V1H13V3H16.12L21,7.88V15.61Z" />
                  </svg>
                </div>
                <div className="stat-details">
                  <h4>AI Agent Active</h4>
                  <p className="stat-value">{platforms.some(p => p.claimed) ? "Yes" : "No"}</p>
                </div>
              </div>
            </div>
            
            <div className="usage-chart-container">
              <h3>Activity Over Time</h3>
              <div className="placeholder-chart">
                <p>Platform activity chart will be displayed here</p>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default MainDashboard; 