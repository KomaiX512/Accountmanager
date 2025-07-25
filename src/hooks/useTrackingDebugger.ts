import { useAuth } from '../context/AuthContext';
import { useUsage } from '../context/UsageContext';
import useFeatureTracking from '../hooks/useFeatureTracking';

/**
 * 🔍 TRACKING SYSTEM DEBUGGER
 * 
 * Use this hook to debug tracking issues in any component
 */
export const useTrackingDebugger = () => {
  const { currentUser } = useAuth();
  const { usage, refreshUsage } = useUsage();
  const { trackRealPostCreation, trackRealDiscussion, trackRealAIReply, trackRealCampaign } = useFeatureTracking();

  const runFullDiagnostic = async () => {
    console.log(`
🔬 TRACKING SYSTEM DIAGNOSTIC
============================
`);

    // 1. Check authentication
    console.log(`1. 🔐 Authentication Check:`);
    console.log(`   Current User: ${currentUser ? currentUser.uid : 'NOT LOGGED IN'}`);
    console.log(`   Email: ${currentUser?.email || 'N/A'}`);
    
    if (!currentUser) {
      console.error(`❌ ISSUE FOUND: User not authenticated - tracking will fail`);
      return false;
    }

    // 2. Check current usage
    console.log(`
2. 📊 Current Usage State:`);
    console.log(`   Posts: ${usage.posts}`);
    console.log(`   Discussions: ${usage.discussions}`);
    console.log(`   AI Replies: ${usage.aiReplies}`);
    console.log(`   Campaigns: ${usage.campaigns}`);

    // 3. Test backend connectivity
    console.log(`
3. 🌐 Backend Connectivity Test:`);
    try {
      await refreshUsage();
      console.log(`   ✅ Backend connection successful`);
    } catch (error) {
      console.error(`   ❌ Backend connection failed:`, error);
      return false;
    }

    // 4. Test tracking functions
    console.log(`
4. 🧪 Testing Tracking Functions:`);
    
    const testResults = {
      posts: false,
      discussions: false,
      aiReplies: false,
      campaigns: false
    };

    try {
      console.log(`   Testing Post Tracking...`);
      testResults.posts = await trackRealPostCreation('test_platform', {
        immediate: true,
        type: 'diagnostic_test'
      });
      console.log(`   Posts: ${testResults.posts ? '✅' : '❌'}`);
    } catch (error) {
      console.error(`   Posts tracking error:`, error);
    }

    try {
      console.log(`   Testing Discussion Tracking...`);
      testResults.discussions = await trackRealDiscussion('test_platform', {
        messageCount: 1,
        type: 'chat'
      });
      console.log(`   Discussions: ${testResults.discussions ? '✅' : '❌'}`);
    } catch (error) {
      console.error(`   Discussion tracking error:`, error);
    }

    try {
      console.log(`   Testing AI Reply Tracking...`);
      testResults.aiReplies = await trackRealAIReply('test_platform', {
        type: 'dm',
        mode: 'instant'
      });
      console.log(`   AI Replies: ${testResults.aiReplies ? '✅' : '❌'}`);
    } catch (error) {
      console.error(`   AI Reply tracking error:`, error);
    }

    try {
      console.log(`   Testing Campaign Tracking...`);
      testResults.campaigns = await trackRealCampaign('test_platform', {
        action: 'goal_set'
      });
      console.log(`   Campaigns: ${testResults.campaigns ? '✅' : '❌'}`);
    } catch (error) {
      console.error(`   Campaign tracking error:`, error);
    }

    // 5. Summary
    const allPassed = Object.values(testResults).every(result => result);
    console.log(`
🎯 DIAGNOSTIC SUMMARY:
=====================
Overall Status: ${allPassed ? '✅ ALL TRACKING WORKING' : '❌ ISSUES FOUND'}

Individual Results:
- Posts: ${testResults.posts ? '✅' : '❌'}
- Discussions: ${testResults.discussions ? '✅' : '❌'}  
- AI Replies: ${testResults.aiReplies ? '✅' : '❌'}
- Campaigns: ${testResults.campaigns ? '✅' : '❌'}

${allPassed ? 
  'Tracking system is working correctly!' : 
  'Check the console errors above to identify issues.'
}
`);

    return allPassed;
  };

  const testSpecificFeature = async (feature: 'posts' | 'discussions' | 'aiReplies' | 'campaigns') => {
    console.log(`🧪 Testing ${feature} tracking...`);
    
    try {
      let result = false;
      
      switch (feature) {
        case 'posts':
          result = await trackRealPostCreation('test_platform', { immediate: true, type: 'test' });
          break;
        case 'discussions':
          result = await trackRealDiscussion('test_platform', { messageCount: 1, type: 'chat' });
          break;
        case 'aiReplies':
          result = await trackRealAIReply('test_platform', { type: 'dm', mode: 'instant' });
          break;
        case 'campaigns':
          result = await trackRealCampaign('test_platform', { action: 'goal_set' });
          break;
      }
      
      console.log(`${feature} tracking result: ${result ? '✅ SUCCESS' : '❌ FAILED'}`);
      return result;
    } catch (error) {
      console.error(`${feature} tracking error:`, error);
      return false;
    }
  };

  const getTrackingStatus = () => {
    return {
      authenticated: !!currentUser,
      userId: currentUser?.uid,
      currentUsage: usage,
      hasTrackingHooks: typeof trackRealPostCreation === 'function' && 
                        typeof trackRealDiscussion === 'function' && 
                        typeof trackRealAIReply === 'function' && 
                        typeof trackRealCampaign === 'function'
    };
  };

  return {
    runFullDiagnostic,
    testSpecificFeature,
    getTrackingStatus
  };
};

export default useTrackingDebugger;
