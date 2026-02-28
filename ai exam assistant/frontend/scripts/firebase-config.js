// Firebase Configuration Template
// Replace the placeholders with your actual Firebase project configuration
// You can find this in your Firebase Console -> Project Settings -> General -> Your apps

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID",
  measurementId: "YOUR_MEASUREMENT_ID"
};

// Initialize Firebase (This part is usually handled in the main script or here)
// Using window global to make it accessible across scripts if needed
window.firebaseConfig = firebaseConfig;
