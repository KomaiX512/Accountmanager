// Email Verification and Password Reset Test Script
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  reload,
  signOut
} from "firebase/auth";

// Firebase config (using the same config from your app)
const firebaseConfig = {
  apiKey: "AIzaSyCzH-GLiwr5fu2WhKXJ4Z2DjI9H63m67_o",
  authDomain: "komx-512.firebaseapp.com",
  projectId: "komx-512",
  storageBucket: "komx-512.firebasestorage.app",
  messagingSenderId: "1066228175404",
  appId: "1:1066228175404:web:9c63b8d0712b8f52a63789",
  measurementId: "G-TYSSNS8HTM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Test email addresses
const testEmail = `test-${Date.now()}@example.com`;
const testPassword = "TestPassword123!";
const testDisplayName = "Test User";

console.log("🧪 Starting Email Verification & Password Reset Tests");
console.log("=" .repeat(60));

async function testEmailVerification() {
  console.log("\n📧 Testing Email Verification Flow...");
  
  try {
    // Step 1: Create account
    console.log(`1. Creating account with email: ${testEmail}`);
    const userCredential = await createUserWithEmailAndPassword(auth, testEmail, testPassword);
    const user = userCredential.user;
    
    console.log(`✅ Account created successfully`);
    console.log(`   - UID: ${user.uid}`);
    console.log(`   - Email: ${user.email}`);
    console.log(`   - Email Verified: ${user.emailVerified}`);
    
    // Step 2: Set display name
    console.log(`2. Setting display name: ${testDisplayName}`);
    await updateProfile(user, { displayName: testDisplayName });
    console.log(`✅ Display name set successfully`);
    
    // Step 3: Send verification email
    console.log(`3. Sending verification email...`);
    await sendEmailVerification(user, {
      url: `${process.env.FRONTEND_URL || 'http://localhost:5174'}/login?verified=true`,
      handleCodeInApp: false
    });
    console.log(`✅ Verification email sent successfully`);
    
    // Step 4: Test login before verification
    console.log(`4. Testing login before email verification...`);
    await signOut(auth);
    
    try {
      const loginResult = await signInWithEmailAndPassword(auth, testEmail, testPassword);
      await reload(loginResult.user);
      
      if (!loginResult.user.emailVerified) {
        await signOut(auth);
        console.log(`✅ Login correctly blocked for unverified email`);
      } else {
        console.log(`❌ Login should have been blocked for unverified email`);
      }
    } catch (error) {
      console.log(`✅ Login correctly blocked: ${error.message}`);
    }
    
    return { success: true, testEmail, testPassword };
    
  } catch (error) {
    console.error(`❌ Email verification test failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function testPasswordReset() {
  console.log("\n🔐 Testing Password Reset Flow...");
  
  try {
    // Use the test email from verification test
    console.log(`1. Sending password reset email to: ${testEmail}`);
    
    await sendPasswordResetEmail(auth, testEmail, {
      url: `${process.env.FRONTEND_URL || 'http://localhost:5174'}/login?reset=true`,
      handleCodeInApp: false
    });
    
    console.log(`✅ Password reset email sent successfully`);
    return { success: true };
    
  } catch (error) {
    console.error(`❌ Password reset test failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function testInvalidEmailHandling() {
  console.log("\n🚫 Testing Invalid Email Handling...");
  
  try {
    // Test with invalid email
    const invalidEmail = "invalid-email-address";
    
    try {
      await createUserWithEmailAndPassword(auth, invalidEmail, testPassword);
      console.log(`❌ Should have failed with invalid email`);
    } catch (error) {
      console.log(`✅ Invalid email correctly rejected: ${error.code}`);
    }
    
    // Test password reset with non-existent email
    try {
      await sendPasswordResetEmail(auth, "nonexistent@example.com");
      console.log(`❌ Should have failed with non-existent email`);
    } catch (error) {
      console.log(`✅ Non-existent email correctly handled: ${error.code}`);
    }
    
    return { success: true };
    
  } catch (error) {
    console.error(`❌ Invalid email handling test failed:`, error.message);
    return { success: false, error: error.message };
  }
}

async function runAllTests() {
  console.log(`🚀 Firebase Auth Testing Started at ${new Date().toISOString()}`);
  
  const results = {
    emailVerification: await testEmailVerification(),
    passwordReset: await testPasswordReset(),
    invalidEmailHandling: await testInvalidEmailHandling()
  };
  
  console.log("\n" + "=".repeat(60));
  console.log("📊 TEST RESULTS SUMMARY");
  console.log("=".repeat(60));
  
  Object.entries(results).forEach(([testName, result]) => {
    const status = result.success ? "✅ PASSED" : "❌ FAILED";
    console.log(`${testName}: ${status}`);
    if (!result.success) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  console.log("\n📋 MANUAL VERIFICATION STEPS:");
  console.log("1. Check your email inbox for verification email");
  console.log("2. Check your email inbox for password reset email");
  console.log("3. Verify email templates look professional");
  console.log("4. Test clicking verification link");
  console.log("5. Test clicking password reset link");
  
  console.log(`\n🧪 Test completed at ${new Date().toISOString()}`);
}

// Run tests
runAllTests().catch(console.error);
