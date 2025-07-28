import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './Cs_Analysis.css';
import '../../utils/jsonDecoder.css';
import useR2Fetch from '../../hooks/useR2Fetch';
import { motion } from 'framer-motion';
import ErrorBoundary from '../ErrorBoundary';
import { decodeJSONToReactElements, formatCount } from '../../utils/jsonDecoder';
import axios from 'axios';
import { registerComponent, unregisterComponent } from '../../utils/componentRegistry';

interface ProfileInfo {
  followersCount?: number;
  followsCount?: number;
  [key: string]: any; // Allow for additional fields from account info
}

interface AccountInfo {
  username: string;
  accountType: string;
  postingStyle: string;
  competitors: string[];
}

interface Cs_AnalysisProps {
  accountHolder: string;
  competitors: string[];
  platform?: 'instagram' | 'twitter' | 'facebook';
}

const Cs_Analysis: React.FC<Cs_AnalysisProps> = ({ accountHolder, competitors, platform = 'instagram' }) => {
  const normalizedAccountHolder = accountHolder;
  
  // ✅ REMOVED: ProcessingContext not needed for competitor operations
  // Individual container loading is managed via competitorLoadingStates
  
  // Component tracking
  const componentId = React.useRef(Math.random().toString(36).substr(2, 9));
  
  // Register component on mount
  React.useEffect(() => {
    registerComponent('Cs_Analysis', platform, componentId.current);
    
    return () => {
      unregisterComponent('Cs_Analysis', componentId.current);
    };
  }, [platform]);
  
  const [selectedCompetitor, setSelectedCompetitor] = useState<string | null>(null);
  const [currentAnalysisIndex, setCurrentAnalysisIndex] = useState(0);
  const [competitorProfiles, setCompetitorProfiles] = useState<Record<string, ProfileInfo>>({});
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [newCompetitor, setNewCompetitor] = useState('');
  const [editCompetitor, setEditCompetitor] = useState('');
  const [currentCompetitor, setCurrentCompetitor] = useState<string | null>(null);
  const [localCompetitors, setLocalCompetitors] = useState<string[]>(competitors);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Add state for accountType and postingStyle
  const [accountType, setAccountType] = useState<string>('branding');
  const [postingStyle, setPostingStyle] = useState<string>('I post about NewYork lives');
  
  // ✅ NEW: Smart loading state for newly added/edited competitors
  const [competitorLoadingStates, setCompetitorLoadingStates] = useState<Record<string, {
    timestamp: number;
    retryCount: number;
    isLoading: boolean;
  }>>({});
  
  // ✅ NEW: Tooltip state for smart loading hover
  const [showLoadingTooltip, setShowLoadingTooltip] = useState<string | null>(null);
  
  // ✅ NEW: Check if competitor is in smart loading period (up to 15 minutes)
  const isCompetitorInLoadingPeriod = (competitor: string): boolean => {
    const state = competitorLoadingStates[competitor];
    if (!state || !state.isLoading) return false;
    
    const currentTime = Date.now();
    const elapsedTime = currentTime - state.timestamp;
    const maxLoadingTime = 15 * 60 * 1000; // 15 minutes in milliseconds
    
    return elapsedTime < maxLoadingTime;
  };

  // ✅ NEW: Start smart loading for a competitor
  const startCompetitorLoading = (competitor: string) => {
    console.log(`[Cs_Analysis] 🔄 Starting smart loading for competitor: ${competitor}`);
    setCompetitorLoadingStates(prev => ({
      ...prev,
      [competitor]: {
        timestamp: Date.now(),
        retryCount: 0,
        isLoading: true
      }
    }));
  };

  // ✅ NEW: Stop smart loading for a competitor
  const stopCompetitorLoading = (competitor: string) => {
    console.log(`[Cs_Analysis] ✅ Stopping smart loading for competitor: ${competitor}`);
    setCompetitorLoadingStates(prev => {
      const newState = { ...prev };
      delete newState[competitor];
      return newState;
    });
  };

  // ✅ NEW: Get remaining loading time for a competitor (in seconds)
  const getRemainingLoadingTime = (competitor: string): number => {
    const state = competitorLoadingStates[competitor];
    if (!state || !state.isLoading) return 0;
    
    const currentTime = Date.now();
    const elapsedTime = currentTime - state.timestamp;
    const maxLoadingTime = 15 * 60 * 1000; // 15 minutes
    const remainingTime = Math.max(0, maxLoadingTime - elapsedTime);
    
    return Math.ceil(remainingTime / 1000); // Return in seconds
  };

  // ✅ NEW: Handle tooltip for smart loading competitors
  const handleLoadingTooltipShow = (competitor: string) => {
    if (isCompetitorInLoadingPeriod(competitor)) {
      setShowLoadingTooltip(competitor);
    }
  };

  const handleLoadingTooltipHide = () => {
    setShowLoadingTooltip(null);
  };

  // ✅ NEW: Get formatted remaining time for tooltip
  const getFormattedRemainingTime = (competitor: string): string => {
    const remainingTime = getRemainingLoadingTime(competitor);
    const minutes = Math.floor(remainingTime / 60);
    const seconds = remainingTime % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };
  // Fetch account info on mount to get accountType and postingStyle
  useEffect(() => {
    const fetchAccountInfo = async () => {
      try {
        // ✅ FIXED: Use retrieve-account-info endpoint to get saved account data
        const response = await axios.get(`/api/retrieve-account-info/${normalizedAccountHolder}?platform=${platform}`);
        const info = response.data;
        console.log(`[Cs_Analysis] ✅ Retrieved account info for ${normalizedAccountHolder}:`, info);
        
        // Update account type and posting style from saved data
        if (info.accountType) setAccountType(info.accountType);
        if (info.postingStyle) setPostingStyle(info.postingStyle);
        
        // Update competitors from saved data if available and different from props
        if (info.competitors && Array.isArray(info.competitors) && info.competitors.length > 0) {
          console.log(`[Cs_Analysis] ✅ Using competitors from account info:`, info.competitors);
          setLocalCompetitors(info.competitors);
        }
      } catch (error: any) {
        console.warn(`[Cs_Analysis] ⚠️ Could not fetch account info for ${normalizedAccountHolder}:`, error.response?.status);
        // Fallback to profile-info for basic account details
        try {
          const profileResponse = await axios.get(`/api/profile-info/${normalizedAccountHolder}?platform=${platform}`);
          const profileInfo = profileResponse.data;
          if (profileInfo.accountType || profileInfo.account_type) setAccountType(profileInfo.accountType || profileInfo.account_type);
          if (profileInfo.postingStyle || profileInfo.posting_style) setPostingStyle(profileInfo.postingStyle || profileInfo.posting_style);
        } catch {}
      }
    };
    fetchAccountInfo();
  }, [normalizedAccountHolder, platform]);

  const competitorsQuery = localCompetitors.length > 0 ? localCompetitors.join(',') : '';
  const competitorEndpoint = competitorsQuery 
    ? `/api/retrieve-multiple/${normalizedAccountHolder}?competitors=${encodeURIComponent(competitorsQuery)}&platform=${platform}&forceRefresh=true&_t=${refreshKey}` 
    : '';
  
  const allCompetitorsFetch = useR2Fetch<any[]>(competitorEndpoint, platform);

  // Debug logging for endpoint and competitors
  console.log(`[Cs_Analysis] 🔍 Component state for ${normalizedAccountHolder}:`, {
    localCompetitors,
    competitorEndpoint,
    fetchLoading: allCompetitorsFetch.loading,
    fetchError: allCompetitorsFetch.error,
    fetchDataLength: allCompetitorsFetch.data?.length || 0,
    accountType,
    postingStyle
  });

  // ✅ NEW: Combine local competitors with any competitors in loading state
  const allDisplayCompetitors = React.useMemo(() => {
    const loadingCompetitors = Object.keys(competitorLoadingStates);
    const allCompetitors = [...new Set([...localCompetitors, ...loadingCompetitors])];
    return allCompetitors;
  }, [localCompetitors, competitorLoadingStates]);

  const competitorData = allDisplayCompetitors.map(competitor => {
    const dataForCompetitor = allCompetitorsFetch.data?.find(item => item.competitor === competitor) || null;
    
    // Enhanced debug logging
    if (dataForCompetitor?.data?.length > 0) {
      console.log(`[Cs_Analysis] ✅ ${competitor} has ${dataForCompetitor.data.length} analysis items`);
    } else if (allCompetitorsFetch.loading) {
      console.log(`[Cs_Analysis] ⏳ ${competitor} data is loading...`);
    } else if (allCompetitorsFetch.error) {
      console.log(`[Cs_Analysis] ❌ ${competitor} failed to load - Error:`, allCompetitorsFetch.error);
    } else {
      console.log(`[Cs_Analysis] ⚠️ ${competitor} has no data available`);
    }

    return {
      competitor,
      fetch: {
        data: dataForCompetitor ? dataForCompetitor.data : undefined,
        loading: allCompetitorsFetch.loading,
        error: allCompetitorsFetch.error,
      },
    };
  });

  const selectedData = selectedCompetitor
    ? competitorData.find(data => data.competitor === selectedCompetitor)?.fetch.data
    : null;
  


  const lastFetchTimeRef = React.useRef<Record<string, number>>({});

  const fetchCompetitorProfile = useCallback(async (competitor: string) => {
    try {
      // Throttle profile pic rendering to once every 30 minutes (1800000 ms)
      const now = Date.now();
      const lastFetchTime = lastFetchTimeRef.current[competitor] || 0;
      if (now - lastFetchTime < 1800000 && competitorProfiles[competitor]) {
        return;
      }
      const response = await axios.get(`/api/profile-info/${competitor}?platform=${platform}`);
      console.log(`Profile info for ${platform} competitor ${competitor}:`, response.data);
      setCompetitorProfiles(prev => ({
        ...prev,
        [competitor]: response.data,
      }));
      setProfileErrors(prev => ({
        ...prev,
        [competitor]: '',
      }));
      lastFetchTimeRef.current[competitor] = now;
    } catch (err: any) {
      setProfileErrors(prev => ({
        ...prev,
        [competitor]: `Failed to load ${platform} profile info.`,
      }));
    }
  }, [competitorProfiles, platform]);

  const fetchAccountInfoWithRetry = useCallback(async (retries = 3, delay = 1000): Promise<string[] | null> => {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios.get(`/api/retrieve-account-info/${normalizedAccountHolder}?platform=${platform}`);
        const accountInfo: AccountInfo = response.data;
        setError(null);
        setNeedsRefresh(false);
        return accountInfo.competitors || [];
      } catch (err: any) {
        if (err.response?.status === 404 && attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        setError(`Failed to fetch updated ${platform} account info. Using local state.`);
        setNeedsRefresh(true);
        setToast(`${platform} sync failed. Please refresh to ensure data is up-to-date.`);
        return null;
      }
    }
    return null;
  }, [normalizedAccountHolder, platform]);

  const updateCompetitors = useCallback(async (updatedCompetitors: string[]) => {
    try {
      console.log(`[Cs_Analysis] 📝 Updating competitors for ${normalizedAccountHolder} on ${platform}:`, updatedCompetitors);
      
      const response = await axios.post(`/api/save-account-info?platform=${platform}`, {
        username: normalizedAccountHolder,
        accountType,
        postingStyle,
        competitors: updatedCompetitors,
        platform: platform
      });
      
      if (response.status === 200) {
        console.log(`[Cs_Analysis] ✅ Successfully updated competitors for ${normalizedAccountHolder}`);
        return true;
      } else {
        console.error(`[Cs_Analysis] ❌ Failed to update competitors - HTTP ${response.status}`);
        return false;
      }
    } catch (error: any) {
      console.error(`[Cs_Analysis] ❌ Error updating ${platform} competitors for ${normalizedAccountHolder}:`, error.response?.data || error.message);
      return false;
    }
  }, [normalizedAccountHolder, platform, accountType, postingStyle]);

  useEffect(() => {
    const syncInitialState = async () => {
      console.log(`[Cs_Analysis] 🔄 Syncing initial competitors state for ${normalizedAccountHolder} on ${platform}`);
      
      // First try to get competitors from the saved account info
      const serverCompetitors = await fetchAccountInfoWithRetry();
      if (serverCompetitors && serverCompetitors.length > 0) {
        console.log(`[Cs_Analysis] ✅ Loaded ${serverCompetitors.length} competitors from AccountInfo API:`, serverCompetitors);
        setLocalCompetitors(serverCompetitors);
        // Force refresh of competitor data when competitors are loaded
        setRefreshKey(prev => prev + 1);
      } else {
        console.log(`[Cs_Analysis] ⚠️ No competitors found in AccountInfo, using fallback from props:`, competitors);
        // Use competitors from props (usually from dashboard state)
        if (competitors && competitors.length > 0) {
          setLocalCompetitors(competitors);
        } else {
          console.log(`[Cs_Analysis] ❌ No competitors available from props either - account holder needs to set up competitors`);
          setError(`No competitors configured for ${normalizedAccountHolder}. Please add competitors to enable analysis.`);
        }
      }
    };
    syncInitialState();
  }, [competitors, fetchAccountInfoWithRetry, normalizedAccountHolder, platform]);

  useEffect(() => {
    localCompetitors.forEach(competitor => {
      if (!competitorProfiles[competitor] && !profileErrors[competitor]) {
        fetchCompetitorProfile(competitor);
      }
    });
  }, [localCompetitors, fetchCompetitorProfile]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ✅ NEW: Cleanup expired competitor loading states every minute
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      setCompetitorLoadingStates(prev => {
        const now = Date.now();
        const maxLoadingTime = 15 * 60 * 1000; // 15 minutes
        let hasExpired = false;
        
        const cleaned = Object.entries(prev).reduce((acc, [competitor, state]) => {
          const elapsedTime = now - state.timestamp;
          if (elapsedTime >= maxLoadingTime) {
            console.log(`[Cs_Analysis] ⏰ Smart loading expired for competitor: ${competitor}`);
            hasExpired = true;
            // Don't include expired entries
          } else {
            acc[competitor] = state;
          }
          return acc;
        }, {} as typeof prev);
        
        if (hasExpired) {
          console.log(`[Cs_Analysis] 🧹 Cleaned up expired loading states`);
        }
        
        return cleaned;
      });
    }, 60000); // Check every minute
    
    return () => clearInterval(cleanupInterval);
  }, []);

  // ✅ NEW: Update countdown timer every 10 seconds for better UX
  useEffect(() => {
    const updateInterval = setInterval(() => {
      setCompetitorLoadingStates(prev => {
        // Force re-render to update countdown timers
        return { ...prev };
      });
    }, 10000); // Update every 10 seconds
    
    return () => clearInterval(updateInterval);
  }, []);

  const handleAddCompetitor = async () => {
    if (!newCompetitor.trim()) {
      setToast('Competitor username cannot be empty.');
      return;
    }
    if (localCompetitors.includes(newCompetitor)) {
      setToast('Competitor already exists.');
      return;
    }

    setLoading(true);
    const originalCompetitors = [...localCompetitors];
    const updatedCompetitors = [...localCompetitors, newCompetitor];
    // ✅ FIXED: Don't update localCompetitors immediately to prevent duplicate containers
    // Only update after server confirmation

    // ✅ NEW: Start smart loading for the new competitor
    startCompetitorLoading(newCompetitor);

    const success = await updateCompetitors(updatedCompetitors);
    if (success) {
      // ✅ FIXED: Only backend operations, NO global processing state trigger
      try {
        // Step 1: Reset/delete the existing account info
        await axios.post('/api/reset-account-info', {
          username: normalizedAccountHolder,
          platform,
        }, { headers: { 'Content-Type': 'application/json' } });
        
        // Step 2: Re-upload the account info with updated competitors
        const accountInfoPayload = {
          username: normalizedAccountHolder,
          accountType,
          postingStyle,
          competitors: updatedCompetitors,
          platform
        };
        
        await axios.post(`/api/save-account-info?platform=${platform}`, accountInfoPayload, {
          headers: { 'Content-Type': 'application/json' }
        });
        
        console.log('[Cs_Analysis] ✅ Successfully reset and re-uploaded account info with updated competitors');
      } catch (err) {
        console.error('[Cs_Analysis] ❌ Failed to reset and re-upload account info:', err);
      }
      
      // ✅ FIXED: Stay in dashboard, show container-level loading only
      setRefreshKey(prev => prev + 1); // Force refresh of competitor data
      const serverCompetitors = await fetchAccountInfoWithRetry();
      if (serverCompetitors) {
        setLocalCompetitors(serverCompetitors);
        setToast('Competitor added successfully! Analysis will be ready within 15 minutes.');
      } else {
        setLocalCompetitors(updatedCompetitors);
        setToast('Competitor added successfully! Analysis will be ready within 15 minutes.');
      }
    } else {
      setLocalCompetitors(originalCompetitors);
      // ✅ NEW: Stop loading if addition failed
      stopCompetitorLoading(newCompetitor);
      setToast('Failed to add competitor.');
    }

    setNewCompetitor('');
    setShowAddModal(false);
    setLoading(false);
  };

  const handleEditCompetitor = async () => {
    if (!editCompetitor.trim()) {
      setToast('Competitor username cannot be empty.');
      return;
    }
    if (!currentCompetitor) {
      setToast('No competitor selected for editing.');
      return;
    }
    if (localCompetitors.includes(editCompetitor) && editCompetitor !== currentCompetitor) {
      setToast('Competitor username already exists.');
      return;
    }

    setLoading(true);
    const originalCompetitors = [...localCompetitors];
    const updatedCompetitors = localCompetitors.map(comp =>
      comp === currentCompetitor ? editCompetitor : comp
    );
    // ✅ FIXED: Don't update localCompetitors immediately to prevent duplicate containers
    // Only update after server confirmation

    // ✅ NEW: Start smart loading for the edited competitor (if name changed)
    if (editCompetitor !== currentCompetitor) {
      startCompetitorLoading(editCompetitor);
      // Stop loading for the old name
      stopCompetitorLoading(currentCompetitor);
    }

    const success = await updateCompetitors(updatedCompetitors);
    if (success) {
      // ✅ FIXED: Only backend operations, NO global processing state trigger
      try {
        // Step 1: Reset/delete the existing account info
        await axios.post('/api/reset-account-info', {
          username: normalizedAccountHolder,
          platform,
        }, { headers: { 'Content-Type': 'application/json' } });
        
        // Step 2: Re-upload the account info with updated competitors
        const accountInfoPayload = {
          username: normalizedAccountHolder,
          accountType,
          postingStyle,
          competitors: updatedCompetitors,
          platform
        };
        
        await axios.post(`/api/save-account-info?platform=${platform}`, accountInfoPayload, {
          headers: { 'Content-Type': 'application/json' }
        });
        
        console.log('[Cs_Analysis] ✅ Successfully reset and re-uploaded account info with updated competitors');
      } catch (err) {
        console.error('[Cs_Analysis] ❌ Failed to reset and re-upload account info:', err);
      }
      
      // ✅ FIXED: Stay in dashboard, show container-level loading only
      setRefreshKey(prev => prev + 1); // Force refresh of competitor data
      const serverCompetitors = await fetchAccountInfoWithRetry();
      if (serverCompetitors) {
        setLocalCompetitors(serverCompetitors);
        setToast(editCompetitor !== currentCompetitor 
          ? 'Competitor updated successfully! Analysis will be ready within 15 minutes.' 
          : 'Competitor updated successfully!');
      } else {
        setLocalCompetitors(updatedCompetitors);
        setToast(editCompetitor !== currentCompetitor 
          ? 'Competitor updated successfully! Analysis will be ready within 15 minutes.' 
          : 'Competitor updated successfully!');
      }
    } else {
      setLocalCompetitors(originalCompetitors);
      // ✅ NEW: Stop loading if edit failed
      if (editCompetitor !== currentCompetitor) {
        stopCompetitorLoading(editCompetitor);
      }
      setToast('Failed to update competitor.');
    }

    setEditCompetitor('');
    setCurrentCompetitor(null);
    setShowEditModal(false);
    setLoading(false);
  };

  const handleDeleteCompetitor = async (competitor: string) => {
    setLoading(true);
    const originalCompetitors = [...localCompetitors];
    const updatedCompetitors = localCompetitors.filter(comp => comp !== competitor);
    setLocalCompetitors(updatedCompetitors);

    // ✅ NEW: Stop smart loading for deleted competitor
    stopCompetitorLoading(competitor);

    const success = await updateCompetitors(updatedCompetitors);
    if (success) {
      // ✅ FIXED: Only backend operations, NO global processing state trigger
      try {
        // Step 1: Reset/delete the existing account info
        await axios.post('/api/reset-account-info', {
          username: normalizedAccountHolder,
          platform,
        }, { headers: { 'Content-Type': 'application/json' } });
        
        // Step 2: Re-upload the account info with updated competitors
        const accountInfoPayload = {
          username: normalizedAccountHolder,
          accountType,
          postingStyle,
          competitors: updatedCompetitors,
          platform
        };
        
        await axios.post(`/api/save-account-info?platform=${platform}`, accountInfoPayload, {
          headers: { 'Content-Type': 'application/json' }
        });
        
        console.log('[Cs_Analysis] ✅ Successfully reset and re-uploaded account info with updated competitors');
      } catch (err) {
        console.error('[Cs_Analysis] ❌ Failed to reset and re-upload account info:', err);
      }
      
      // ✅ FIXED: Stay in dashboard, no navigation to loading state
      setRefreshKey(prev => prev + 1); // Force refresh of competitor data
      const serverCompetitors = await fetchAccountInfoWithRetry();
      if (serverCompetitors) {
        setLocalCompetitors(serverCompetitors);
        setToast('Competitor deleted successfully!');
      } else {
        setLocalCompetitors(updatedCompetitors);
        setToast('Competitor deleted successfully!');
      }
    } else {
      setLocalCompetitors(originalCompetitors);
      setToast('Failed to delete competitor.');
    }

    if (selectedCompetitor === competitor) setSelectedCompetitor(null);
    setLoading(false);
  };

  const handleManualRefresh = async () => {
    setLoading(true);
    const serverCompetitors = await fetchAccountInfoWithRetry(5, 2000);
    if (serverCompetitors) {
      setLocalCompetitors(serverCompetitors);
      setRefreshKey(prev => prev + 1); // Force refresh of competitor data
      setToast('Successfully synced with server!');
    }
    setLoading(false);
  };

  const renderAnalysisContent = (analysisData: any) => {
    if (!analysisData || typeof analysisData !== 'object') {
      return <p className="analysis-detail">No details available.</p>;
    }

    // Use the new comprehensive JSON decoder with advanced options
    const decodedSections = decodeJSONToReactElements(analysisData, {
      customClassPrefix: 'analysis',
      enableBoldFormatting: true,
      enableItalicFormatting: true,
      enableHighlighting: true,
      enableQuotes: true,
      enableEmphasis: true,
      preserveJSONStructure: true,
      smartParagraphDetection: true,
      maxNestingLevel: 6, // ✅ Increased to handle deeper nesting
      enableDebugLogging: false, // ✅ Debug logging for troubleshooting (disable in production)
      skipDecodingForElements: [
        'Module Type',
        'Platform', 
        'Primary Username',
        'Competitor',
        'Timestamp',
        'Intelligence Source'
        // ✅ REMOVED 'Data' - we want to decode the Data content, just skip the metadata
      ]
    });

    return decodedSections.map((section, idx) => (
      <div key={idx} className="analysis-subsection">
        <h6 className="analysis-subheading">{section.heading}</h6>
        <div className="analysis-content-wrapper">
          {section.content}
        </div>
      </div>
    ));
  };

  const handleNextAnalysis = () => {
    if (currentAnalysisIndex < (selectedData?.length || 0) - 1) {
      setCurrentAnalysisIndex(currentAnalysisIndex + 1);
    }
  };

  const handlePrevAnalysis = () => {
    if (currentAnalysisIndex > 0) {
      setCurrentAnalysisIndex(currentAnalysisIndex - 1);
    }
  };

  const [showDataInfo, setShowDataInfo] = useState(false);

  return (
    <>
      <ErrorBoundary>
        <motion.div
          className="cs-analysis-container"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {error && (
            <div className="error-message">
              <div className="error-content">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ff6b6b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="15" y1="9" x2="9" y2="15"/>
                  <line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
                <span>{error}</span>
              </div>
              {needsRefresh && (
                <motion.button
                  className="refresh-btn"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleManualRefresh}
                  disabled={loading}
                >
                  {loading ? 'Refreshing...' : 'Refresh Now'}
                </motion.button>
              )}
            </div>
          )}

          <div className="competitor-header">
            <motion.button
              className="add-competitor-btn"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowAddModal(true)}
              disabled={loading}
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
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Competitor
            </motion.button>
          </div>

          {/* Refactor competitor list container to be fixed-size and scrollable */}
          <div className="competitor-list-scrollable">
            {/* Add heading for competitor list */}
            <h2 className="competitor-list-heading">Competitors</h2>
            {competitorData.map(({ competitor, fetch }, index) => {
              // ✅ NEW: Check if competitor is in smart loading period
              const isInSmartLoading = isCompetitorInLoadingPeriod(competitor);
              const remainingTime = getRemainingLoadingTime(competitor);
              
              return (
                <motion.div
                  key={competitor}
                  className={`competitor-sub-container ${fetch.data && fetch.data.length > 0 ? 'loaded' : ''} ${(!fetch.data || fetch.data.length === 0) && !isInSmartLoading ? 'no-data' : ''} ${isInSmartLoading ? 'smart-loading' : ''}`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1, duration: 0.2 }}
                  whileHover={{ scale: 1.02 }}
                  onMouseEnter={() => handleLoadingTooltipShow(competitor)}
                  onMouseLeave={handleLoadingTooltipHide}
                >
                  {/* Add competitor heading and viewed badge */}
                  <div className="competitor-header-row">
                    <span className="competitor-name-heading">{competitor}</span>
                    {selectedCompetitor === competitor && (
                      <span className="viewed-badge">Viewed</span>
                    )}
                  </div>
                  {/* ✅ NEW: Smart loading tooltip */}
                  {showLoadingTooltip === competitor && isInSmartLoading && (
                    <div className="smart-loading-tooltip">
                      <div className="tooltip-content">
                        <div className="tooltip-title">🔄 Analysis in Progress</div>
                        <div className="tooltip-message">
                          Competitor analysis will be ready in approximately <strong>{getFormattedRemainingTime(competitor)}</strong>
                        </div>
                        <div className="tooltip-note">
                          Analysis typically completes within 15 minutes. The container will update automatically when ready.
                        </div>
                      </div>
                      <div className="tooltip-arrow"></div>
                    </div>
                  )}
                  
                  <div className="competitor-actions">
                    <motion.button
                      className="action-btn edit-btn"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setCurrentCompetitor(competitor);
                        setEditCompetitor(competitor);
                      setShowEditModal(true);
                    }}
                    disabled={loading}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#e0e0ff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </motion.button>
                  <motion.button
                    className="action-btn delete-btn"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleDeleteCompetitor(competitor)}
                    disabled={loading}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#ff4444"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </motion.button>
                </div>
                <span
                  className="overlay-text"
                  onClick={() => {
                    // ✅ FIXED: Don't allow clicks during smart loading period
                    if (isInSmartLoading) {
                      console.log(`[Cs_Analysis] ⏸️ Competitor ${competitor} is in loading state - click disabled`);
                      return;
                    }
                    
                    console.log(`[Cs_Analysis] 🖱️ Clicked competitor: ${competitor}`, {
                      hasData: fetch.data && fetch.data.length > 0,
                      dataLength: fetch.data?.length || 0,
                      isLoading: fetch.loading,
                      isInSmartLoading
                    });
                    setSelectedCompetitor(competitor);
                  }}
                  style={{
                    cursor: isInSmartLoading ? 'not-allowed' : 'pointer'
                  }}
                >
                  {competitor}
                </span>
                {/* ✅ NEW: Show smart loading state for newly added/edited competitors */}
                {isInSmartLoading && !fetch.loading && (
                  <div className="futuristic-loading smart-loading-overlay">
                    <span className="loading-text">
                      Analysis in progress... {Math.floor(remainingTime / 60)}:{(remainingTime % 60).toString().padStart(2, '0')} remaining
                    </span>
                    <div className="particle-effect" />
                  </div>
                )}
                {/* ✅ UPDATED: Only show regular loading if not in smart loading */}
                {fetch.loading && !isInSmartLoading && (
                  <div className="futuristic-loading">
                    <span className="loading-text">Analyzing {competitor}...</span>
                    <div className="particle-effect" />
                  </div>
                )}
                {/* ✅ FIXED: Always show "no data" overlay but make it non-blocking with pointer-events: none */}
                {(!fetch.data || fetch.data.length === 0) && !fetch.loading && !isInSmartLoading && (
                  <span className="no-data-text"></span>
                )}
              </motion.div>
              );
            })}
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
      </ErrorBoundary>

      {/* All modals rendered as React Portals for absolute screen positioning */}
      {showAddModal && createPortal(
        <motion.div
          className="popup-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => {
            setShowAddModal(false);
            setNewCompetitor('');
          }}
        >
          <motion.div
            className="popup-content"
            initial={{ scale: 0.8, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.8, y: 50 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Add Competitor</h3>
            <input
              type="text"
              value={newCompetitor}
              onChange={(e) => setNewCompetitor(e.target.value)}
              placeholder="Enter competitor username"
              className="competitor-input"
              disabled={loading}
            />
            <div className="modal-actions">
              <motion.button
                className="modal-btn save-btn"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleAddCompetitor}
                disabled={loading || !newCompetitor.trim()}
              >
                {loading ? 'Saving...' : 'Save'}
              </motion.button>
              <motion.button
                className="modal-btn cancel-btn"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setShowAddModal(false);
                  setNewCompetitor('');
                }}
                disabled={loading}
              >
                Cancel
              </motion.button>
            </div>
          </motion.div>
        </motion.div>,
        document.body
      )}

      {showEditModal && createPortal(
        <motion.div
          className="popup-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => {
            setShowEditModal(false);
            setEditCompetitor('');
            setCurrentCompetitor(null);
          }}
        >
          <motion.div
            className="popup-content"
            initial={{ scale: 0.8, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.8, y: 50 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Edit Competitor</h3>
            <input
              type="text"
              value={editCompetitor}
              onChange={(e) => setEditCompetitor(e.target.value)}
              placeholder="Edit competitor username"
              className="competitor-input"
              disabled={loading}
            />
            <div className="modal-actions">
              <motion.button
                className="modal-btn save-btn"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleEditCompetitor}
                disabled={loading || !editCompetitor.trim()}
              >
                {loading ? 'Saving...' : 'Save'}
              </motion.button>
              <motion.button
                className="modal-btn cancel-btn"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setShowEditModal(false);
                  setEditCompetitor('');
                  setCurrentCompetitor(null);
                }}
                disabled={loading}
              >
                Cancel
              </motion.button>
            </div>
          </motion.div>
        </motion.div>,
        document.body
      )}

      {selectedCompetitor && createPortal(
        <motion.div
          className="popup-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => setSelectedCompetitor(null)}
        >
          <motion.div
            className="popup-content"
            initial={{ scale: 0.8, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.8, y: 50 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="profile-section">
              <h3>{selectedCompetitor}</h3>
              {profileErrors[selectedCompetitor] ? (
                <p className="error-text">{profileErrors[selectedCompetitor]}</p>
              ) : competitorProfiles[selectedCompetitor] ? (
                <div className="stats">
                  <span>Followers: {formatCount(competitorProfiles[selectedCompetitor].followersCount)}</span>
                  <span>Following: {formatCount(competitorProfiles[selectedCompetitor].followsCount)}</span>
                </div>
              ) : (
                <div className="stats">
                  <span>Followers: Loading...</span>
                  <span>Following: Loading...</span>
                </div>
              )}
            </div>
            
            {/* ✅ NEW: Compact data limitation notice */}
            <div className="compact-data-notice" onClick={() => setShowDataInfo(!showDataInfo)}>
              <div className="notice-icon-tiny">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="12" 
                  height="12" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <span className="notice-text-compact">
                Limited analysis? Click for details
              </span>
              <div className="expand-icon">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  width="10" 
                  height="10" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round"
                >
                  <polyline points="6,9 12,15 18,9"/>
                </svg>
              </div>
            </div>
            
            {/* ✅ NEW: Expandable detailed information */}
            {showDataInfo && (
              <div className="expanded-data-info">
                <div className="info-content">
                  <p>For exact competitive analysis, ensure the competitor has sufficient public content. Limited insights may indicate the competitor needs 2-3 more posts for comprehensive analysis.</p>
                </div>
              </div>
            )}
            
            <div className="analysis-section">
              <h4>Competitor Analysis Report</h4>
              {selectedData?.length ? (
                <motion.div
                  key={currentAnalysisIndex}
                  className="analysis-report"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <h5>Analysis {currentAnalysisIndex + 1}</h5>
                  {renderAnalysisContent(selectedData[currentAnalysisIndex]?.data || selectedData[currentAnalysisIndex])}
                  <div className="navigation-buttons">
                    <motion.button
                      className="nav-btn"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handlePrevAnalysis}
                      disabled={currentAnalysisIndex === 0}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#e0e0ff"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M15 18l-6-6 6-6" />
                      </svg>
                      Previous
                    </motion.button>
                    <motion.button
                      className="nav-btn"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleNextAnalysis}
                      disabled={currentAnalysisIndex === selectedData.length - 1}
                    >
                      Next
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#e0e0ff"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </motion.button>
                  </div>
                </motion.div>
              ) : (
                <div className="no-analysis-explanation">
                  <div className="explanation-header">
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      width="24" 
                      height="24" 
                      viewBox="0 0 24 24" 
                      fill="none" 
                      stroke="#ffa500" 
                      strokeWidth="2" 
                      strokeLinecap="round" 
                      strokeLinejoin="round"
                    >
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="12" y1="8" x2="12" y2="12"/>
                      <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <h4>Competitor Analysis Not Available</h4>
                  </div>
                  
                  <div className="explanation-content">
                    <p>We cannot access the analysis for <strong>{selectedCompetitor}</strong>. This could be due to several reasons:</p>
                    
                    <div className="reason-list">
                      <div className="reason-item">
                        <span className="reason-icon">❌</span>
                        <div className="reason-text">
                          <strong>Incorrect Username:</strong> The competitor username might be misspelled or doesn't exist on {platform}
                        </div>
                      </div>
                      
                      <div className="reason-item">
                        <span className="reason-icon">🔒</span>
                        <div className="reason-text">
                          <strong>Private Account:</strong> The competitor's profile is private and cannot be analyzed
                        </div>
                      </div>
                      
                      <div className="reason-item">
                        <span className="reason-icon">🆕</span>
                        <div className="reason-text">
                          <strong>New Competitor:</strong> Recently added competitor - analysis is still processing (can take up to 15 minutes)
                        </div>
                      </div>
                      
                      <div className="reason-item">
                        <span className="reason-icon">⚠️</span>
                        <div className="reason-text">
                          <strong>Technical Issue:</strong> Temporary server issues or rate limiting from {platform}
                        </div>
                      </div>
                    </div>
                    
                    <div className="suggested-actions">
                      <h5>🛠️ Suggested Actions:</h5>
                      <ul>
                        <li><strong>Verify Username:</strong> Double-check the competitor's {platform} username for typos</li>
                        <li><strong>Check Profile:</strong> Ensure the competitor's profile is public and accessible</li>
                        <li><strong>Wait for Processing:</strong> If recently added, wait 10-15 minutes for analysis to complete</li>
                        <li><strong>Edit or Delete:</strong> Use the edit button to correct the username or delete if no longer needed</li>
                        <li><strong>Try Again:</strong> Refresh the page and check if analysis becomes available</li>
                      </ul>
                    </div>
                    
                    <div className="action-buttons">
                      <motion.button
                        className="modal-btn edit-btn-modal"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setCurrentCompetitor(selectedCompetitor);
                          setEditCompetitor(selectedCompetitor || '');
                          setSelectedCompetitor(null);
                          setShowEditModal(true);
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#e0e0ff"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                        Edit Competitor
                      </motion.button>
                      
                      <motion.button
                        className="modal-btn delete-btn-modal"
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          if (selectedCompetitor) {
                            handleDeleteCompetitor(selectedCompetitor);
                            setSelectedCompetitor(null);
                          }
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#ff4444"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                        Delete Competitor
                      </motion.button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <motion.button
              className="close-btn"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setSelectedCompetitor(null)}
            >
              Close
            </motion.button>
          </motion.div>
        </motion.div>,
        document.body
      )}
    </>
  );
};

export default Cs_Analysis;