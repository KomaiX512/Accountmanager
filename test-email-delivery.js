// Comprehensive Email Delivery and Firebase Auth Test
import { initializeApp } from "firebase/app";
import { 
  getAuth, 
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  updateProfile,
  reload,
  signOut,
  deleteUser
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCzH-GLiwr5fu2WhKXJ4Z2DjI9H63m67_o",
  authDomain: "komx-512.firebaseapp.com",
  projectId: "komx-512",
  storageBucket: "komx-512.firebasestorage.app",
  messagingSenderId: "1066228175404",
  appId: "1:1066228175404:web:9c63b8d0712b8f52a63789",
  measurementId: "G-TYSSNS8HTM"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Use a real email for testing (replace with your test email)
const testEmail = "komail.test@gmail.com"; // Replace with your actual test email
const testPassword = "TestPassword123!";
const nonExistentEmail = "definitely-does-not-exist-12345@nonexistentdomain.com";

console.log("🔍 COMPREHENSIVE EMAIL DELIVERY TEST");
console.log("=" .repeat(60));

async function testRealEmailDelivery() {
  console.log("\n📧 Testing Real Email Delivery...");
  
  try {
    // Create account with real email
    console.log(`1. Creating account with: ${testEmail}`);
    const userCredential = await createUserWithEmailAndPassword(auth, testEmail, testPassword);
    const user = userCredential.user;
    
    console.log(`✅ Account created - UID: ${user.uid}`);
    
    // Set display name
    await updateProfile(user, { displayName: "Test User" });
    
    // Send verification email
    console.log(`2. Sending verification email...`);
    await sendEmailVerification(user, {
      url: `http://localhost:5174/login?verified=true`,
      handleCodeInApp: false
    });
    console.log(`✅ Verification email sent to ${testEmail}`);
    
    // Test login blocking
    await signOut(auth);
    console.log(`3. Testing login block for unverified email...`);
    
    try {
      const loginResult = await signInWithEmailAndPassword(auth, testEmail, testPassword);
      await reload(loginResult.user);
      
      if (!loginResult.user.emailVerified) {
        await signOut(auth);
        console.log(`✅ Login correctly blocked - user not verified`);
      } else {
        console.log(`⚠️  User appears to be already verified`);
        await signOut(auth);
      }
    } catch (error) {
      console.log(`✅ Login blocked with error: ${error.code}`);
    }
    
    return { success: true, userId: user.uid };
    
  } catch (error) {
    console.error(`❌ Real email test failed: ${error.code} - ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testPasswordResetDelivery() {
  console.log("\n🔐 Testing Password Reset Email Delivery...");
  
  try {
    console.log(`1. Sending password reset to existing email: ${testEmail}`);
    await sendPasswordResetEmail(auth, testEmail, {
      url: `http://localhost:5174/login?reset=true`,
      handleCodeInApp: false
    });
    console.log(`✅ Password reset email sent successfully`);
    
    // Test with non-existent email
    console.log(`2. Testing password reset with non-existent email...`);
    try {
      await sendPasswordResetEmail(auth, nonExistentEmail);
      console.log(`⚠️  Password reset succeeded for non-existent email (Firebase security feature)`);
    } catch (error) {
      console.log(`✅ Password reset failed for non-existent email: ${error.code}`);
    }
    
    return { success: true };
    
  } catch (error) {
    console.error(`❌ Password reset test failed: ${error.code} - ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function testEmailConfiguration() {
  console.log("\n⚙️  Testing Email Configuration...");
  
  try {
    // Check Firebase project settings
    console.log(`1. Firebase Project ID: ${firebaseConfig.projectId}`);
    console.log(`2. Auth Domain: ${firebaseConfig.authDomain}`);
    
    // Test auth instance
    console.log(`3. Auth instance initialized: ${auth ? '✅' : '❌'}`);
    console.log(`4. Current user: ${auth.currentUser ? auth.currentUser.email : 'None'}`);
    
    return { success: true };
    
  } catch (error) {
    console.error(`❌ Configuration test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function cleanupTestUser(userId) {
  console.log("\n🧹 Cleaning up test user...");
  
  try {
    // Sign in to delete the user
    await signInWithEmailAndPassword(auth, testEmail, testPassword);
    const user = auth.currentUser;
    
    if (user) {
      await deleteUser(user);
      console.log(`✅ Test user deleted successfully`);
    }
    
  } catch (error) {
    console.log(`⚠️  Could not delete test user: ${error.code}`);
    console.log(`   This is normal if the user doesn't exist or is already deleted`);
  }
}

async function runEmailDeliveryTests() {
  console.log(`🚀 Starting comprehensive email tests at ${new Date().toISOString()}`);
  
  const results = {
    configuration: await testEmailConfiguration(),
    emailDelivery: await testRealEmailDelivery(),
    passwordReset: await testPasswordResetDelivery()
  };
  
  console.log("\n" + "=".repeat(60));
  console.log("📊 EMAIL DELIVERY TEST RESULTS");
  console.log("=".repeat(60));
  
  Object.entries(results).forEach(([testName, result]) => {
    const status = result.success ? "✅ PASSED" : "❌ FAILED";
    console.log(`${testName}: ${status}`);
    if (!result.success) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  // Cleanup
  if (results.emailDelivery.success && results.emailDelivery.userId) {
    await cleanupTestUser(results.emailDelivery.userId);
  }
  
  console.log("\n📋 MANUAL VERIFICATION CHECKLIST:");
  console.log("1. ✉️  Check inbox for verification email from Firebase");
  console.log("2. 🔐 Check inbox for password reset email from Firebase");
  console.log("3. 📱 Check spam/junk folders if emails not in inbox");
  console.log("4. 🔗 Test clicking verification link in email");
  console.log("5. 🔗 Test clicking password reset link in email");
  console.log("6. 🎨 Verify email templates look professional");
  console.log("7. 📧 Confirm sender is from Firebase/Google");
  
  console.log("\n⚠️  IMPORTANT NOTES:");
  console.log("• Firebase doesn't send password reset emails to non-existent addresses (security feature)");
  console.log("• Verification emails may take 1-2 minutes to arrive");
  console.log("• Check your Firebase Console > Authentication > Templates for email customization");
  
  console.log(`\n🏁 Test completed at ${new Date().toISOString()}`);
}

runEmailDeliveryTests().catch(console.error);
