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

// Use environment variables with fallbacks
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCzH-GLiwr5fu2WhKXJ4Z2DjI9H63m67_o",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "komx-512.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "komx-512",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "komx-512.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1066228175404",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1066228175404:web:9c63b8d0712b8f52a63789",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-TYSSNS8HTM"
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
    
    // Send email verification
    await sendEmailVerification(user, {
      url: `${window.location.origin}/login?verified=true`,
      handleCodeInApp: false
    });
    
    console.log('Email verification sent to:', email);
    
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
    
    // Check if email is verified
    if (!user.emailVerified) {
      // Sign out the user since email is not verified
      await signOut(auth);
      throw new Error('Please verify your email before signing in. Check your inbox for the verification link.');
    }
    
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
      throw new Error('No user is currently signed in');
    }
    
    if (user.emailVerified) {
      throw new Error('Email is already verified');
    }
    
    await sendEmailVerification(user, {
      url: `${window.location.origin}/login?verified=true`,
      handleCodeInApp: false
    });
    
    console.log('Email verification sent to:', user.email);
    
    // Log verification email sent
    logEvent(analytics, 'email_verification_sent', {
      method: 'email'
    });
  } catch (error: any) {
    console.error("Error sending verification email:", error);
    
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