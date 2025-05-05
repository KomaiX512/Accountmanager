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
  updateProfile
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
    await sendPasswordResetEmail(auth, email);
    
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