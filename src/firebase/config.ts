import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  getIdToken,
  User,
  setPersistence,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  reload
} from "firebase/auth";
import { getAnalytics, logEvent } from "firebase/analytics";

// Use environment variables with fallbacks - Updated to sentient-marketing project
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDRbWjU7Y4GivCtMp8eWHcxTKRkLDt-oxs",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "sentient-marketing.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "sentient-marketing",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "sentient-marketing.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "826334050343",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:826334050343:web:38aeb564c393a9e6eaf602",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-Y6XV4XFFBP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const analytics = getAnalytics(app);

// Enable persistence for "Remember Me" functionality
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Error setting auth persistence:", error);
});

// Helper functions for authentication
export const signInWithGoogle = async (): Promise<User | null> => {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    
    // Log successful login event
    logEvent(analytics, 'login', {
      method: 'google'
    });
    
    return user;
  } catch (error: any) {
    console.error("Error signing in with Google:", error);
    
    // Log failed login attempt
    logEvent(analytics, 'login_error', {
      error_code: error.code || 'unknown',
      error_message: error.message || 'Unknown error'
    });
    
    throw error;
  }
};

// Email/Password Authentication functions
export const registerWithEmailPassword = async (
  email: string, 
  password: string, 
  displayName: string
): Promise<User | null> => {
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const user = result.user;
    
    // Set user display name
    await updateProfile(user, { displayName });
    
    // Email verification temporarily disabled during sign up (will re-enable later)
    // try {
    //   await sendEmailVerification(user, {
    //     url: `${window.location.origin}/login?verified=true`,
    //     handleCodeInApp: false
    //   });
    //   console.log('✅ Email verification sent successfully to:', email);
    //   console.log('✅ Verification URL:', `${window.location.origin}/login?verified=true`);
    // } catch (verificationError: any) {
    //   console.error('❌ Failed to send email verification:', verificationError);
    //   console.error('❌ User object:', user);
    //   console.error('❌ User email:', user.email);
    //   console.error('❌ User emailVerified status:', user.emailVerified);
    //   throw new Error(`Failed to send verification email: ${verificationError.message || 'Unknown error'}`);
    // }
    
    // Log successful registration event
    logEvent(analytics, 'sign_up', {
      method: 'email'
    });
    
    return user;
  } catch (error: any) {
    console.error("Error registering with email/password:", error);
    
    // Log failed registration attempt
    logEvent(analytics, 'sign_up_error', {
      error_code: error.code || 'unknown',
      error_message: error.message || 'Unknown error'
    });
    
    throw error;
  }
};

export const signInWithEmailPassword = async (
  email: string, 
  password: string
): Promise<User | null> => {
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const user = result.user;
    
    // Reload user to get latest emailVerified status
    await reload(user);
    
    // Email verification is only required for sign-up, not sign-in
    // Allow users to sign in regardless of email verification status
    
    // Log successful login event
    logEvent(analytics, 'login', {
      method: 'email'
    });
    
    return user;
  } catch (error: any) {
    console.error("Error signing in with email/password:", error);
    
    // Log failed login attempt
    logEvent(analytics, 'login_error', {
      error_code: error.code || 'unknown',
      error_message: error.message || 'Unknown error'
    });
    
    throw error;
  }
};

export const resetPassword = async (email: string): Promise<void> => {
  try {
    await sendPasswordResetEmail(auth, email, {
      url: `${window.location.origin}/login?reset=true`,
      handleCodeInApp: false
    });
    
    console.log('Password reset email sent to:', email);
    
    // Log password reset request
    logEvent(analytics, 'password_reset', {
      method: 'email'
    });
  } catch (error: any) {
    console.error("Error sending password reset email:", error);
    
    // Log failed password reset attempt
    logEvent(analytics, 'password_reset_error', {
      error_code: error.code || 'unknown',
      error_message: error.message || 'Unknown error'
    });
    
    throw error;
  }
};

// Send email verification to current user
export const sendVerificationEmail = async (): Promise<void> => {
  try {
    const user = auth.currentUser;
    if (!user) {
      console.error('❌ No user is currently signed in for verification');
      throw new Error('No user is currently signed in');
    }
    
    console.log('🔍 Sending verification email to user:', user.email);
    console.log('🔍 User emailVerified status:', user.emailVerified);
    
    if (user.emailVerified) {
      console.log('✅ Email is already verified, skipping');
      throw new Error('Email is already verified');
    }
    
    await sendEmailVerification(user, {
      url: `${window.location.origin}/login?verified=true`,
      handleCodeInApp: false
    });
    
    console.log('✅ Email verification sent successfully to:', user.email);
    console.log('✅ Verification URL:', `${window.location.origin}/login?verified=true`);
    
    // Log verification email sent
    logEvent(analytics, 'email_verification_sent', {
      method: 'email'
    });
  } catch (error: any) {
    console.error("❌ Error sending verification email:", error);
    console.error("❌ Error code:", error.code);
    console.error("❌ Error message:", error.message);
    
    // Log failed verification email attempt
    logEvent(analytics, 'email_verification_error', {
      error_code: error.code || 'unknown',
      error_message: error.message || 'Unknown error'
    });
    
    throw error;
  }
};

// Check if current user's email is verified
export const checkEmailVerified = async (): Promise<boolean> => {
  try {
    const user = auth.currentUser;
    if (!user) return false;
    
    // Reload user to get latest emailVerified status
    await reload(user);
    return user.emailVerified;
  } catch (error) {
    console.error("Error checking email verification:", error);
    return false;
  }
};

export const logoutUser = async (): Promise<void> => {
  try {
    await signOut(auth);
    
    // Log logout event
    logEvent(analytics, 'logout');
  } catch (error) {
    console.error("Error signing out:", error);
    throw error;
  }
};

export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};

export const getUserToken = async (): Promise<string | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  
  try {
    return await getIdToken(user);
  } catch (error) {
    console.error("Error getting user token:", error);
    return null;
  }
};

// Export the auth instance for onAuthStateChanged usage elsewhere
export { auth, onAuthStateChanged }; 