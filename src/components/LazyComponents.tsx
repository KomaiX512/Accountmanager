// 🚀 AGGRESSIVE LAZY LOADING - BREAK UP MASSIVE 2.4MB BUNDLE
import { Suspense, lazy, memo } from 'react';

// AGGRESSIVE lazy loading to eliminate unused code bloat
const LazyTuiImageEditor = lazy(() => import('./common/CanvasEditor'));
const LazyPlatformDashboard = lazy(() => import('./dashboard/PlatformDashboard'));
const LazyTwitterCompose = lazy(() => import('./twitter/TwitterCompose'));
const LazyInstagramDashboard = lazy(() => import('./instagram/Dashboard'));
const LazyFacebookDashboard = lazy(() => import('./facebook/FacebookDashboard'));
const LazyLinkedInDashboard = lazy(() => import('./linkedin/LinkedInDashboard'));

// Heavy component lazy loading
const LazyCs_Analysis = lazy(() => import('./instagram/Cs_Analysis'));
const LazyOurStrategies = lazy(() => import('./instagram/OurStrategies'));
const LazyPostCooked = lazy(() => import('./instagram/PostCooked'));
const LazyDmsComments = lazy(() => import('./instagram/Dms_Comments'));
const LazyNews4U = lazy(() => import('./common/News4U'));

// Optimized loading placeholder with memo
const LoadingPlaceholder = memo(({ text = "Loading" }: { text?: string }) => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    fontSize: '14px',
    color: '#666',
    minHeight: '200px', // Prevent CLS by reserving space
    width: '100%'
  }}>
    <div style={{
      width: '20px',
      height: '20px',
      border: '2px solid #f3f3f3',
      borderTop: '2px solid #666',
      borderRadius: '50%',
      animation: 'spin 1s linear infinite',
      marginRight: '10px'
    }}></div>
    {text}...
    <style>{`
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `}</style>
  </div>
));

// Export optimized lazy components
export const TuiImageEditor = memo((props: any) => (
  <Suspense fallback={<LoadingPlaceholder text="Image Editor" />}>
    <LazyTuiImageEditor {...props} />
  </Suspense>
));

export const PlatformDashboard = memo((props: any) => (
  <Suspense fallback={<LoadingPlaceholder text="Dashboard" />}>
    <LazyPlatformDashboard {...props} />
  </Suspense>
));

export const TwitterCompose = memo((props: any) => (
  <Suspense fallback={<LoadingPlaceholder text="Twitter" />}>
    <LazyTwitterCompose {...props} />
  </Suspense>
));

export const InstagramDashboard = memo((props: any) => (
  <Suspense fallback={<LoadingPlaceholder text="Instagram" />}>
    <LazyInstagramDashboard {...props} />
  </Suspense>
));

export const FacebookDashboard = memo((props: any) => (
  <Suspense fallback={<LoadingPlaceholder text="Facebook" />}>
    <LazyFacebookDashboard {...props} />
  </Suspense>
));

export const LinkedInDashboard = memo((props: any) => (
  <Suspense fallback={<LoadingPlaceholder text="LinkedIn" />}>
    <LazyLinkedInDashboard {...props} />
  </Suspense>
));

export const Cs_Analysis = memo((props: any) => (
  <Suspense fallback={<LoadingPlaceholder text="Analysis" />}>
    <LazyCs_Analysis {...props} />
  </Suspense>
));

export const OurStrategies = memo((props: any) => (
  <Suspense fallback={<LoadingPlaceholder text="Strategies" />}>
    <LazyOurStrategies {...props} />
  </Suspense>
));

// CRITICAL LCP FIX: Ultra-fast skeleton for PostCooked
const PostCookedSkeleton = memo(() => (
  <div style={{
    minHeight: '400px',
    padding: '20px',
    background: '#f8f9fa',
    borderRadius: '8px',
    width: '100%'
  }}>
    <div style={{
      height: '24px',
      background: '#e0e0e0',
      borderRadius: '4px',
      marginBottom: '16px',
      width: '150px'
    }}></div>
    <div style={{
      height: '60px',
      background: '#e0e0e0',
      borderRadius: '8px',
      marginBottom: '16px'
    }}></div>
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
      gap: '16px'
    }}>
      {[1,2,3].map(i => (
        <div key={i} style={{
          height: '320px',
          background: '#e0e0e0',
          borderRadius: '8px'
        }}></div>
      ))}
    </div>
  </div>
));

export const PostCooked = memo((props: any) => (
  <Suspense fallback={<PostCookedSkeleton />}>
    <LazyPostCooked {...props} />
  </Suspense>
));

export const DmsComments = memo((props: any) => (
  <Suspense fallback={<LoadingPlaceholder text="Comments" />}>
    <LazyDmsComments {...props} />
  </Suspense>
));

export const News4U = memo((props: any) => (
  <Suspense fallback={<LoadingPlaceholder text="News" />}>
    <LazyNews4U {...props} />
  </Suspense>
));
