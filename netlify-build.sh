#!/bin/bash

# Create the secrets file for Netlify deployment
# This reads from Netlify Environment Variables

cat <<EOF > frontend/scripts/firebase-secrets.js
// Generated during Netlify Build
window.firebaseConfig = {
  apiKey: "${FIREBASE_API_KEY}",
  authDomain: "${FIREBASE_AUTH_DOMAIN}",
  projectId: "${FIREBASE_PROJECT_ID}",
  storageBucket: "${FIREBASE_STORAGE_BUCKET}",
  messagingSenderId: "${FIREBASE_MESSAGING_SENDER_ID}",
  appId: "${FIREBASE_APP_ID}",
  measurementId: "${FIREBASE_MEASUREMENT_ID}"
};
EOF

echo "Firebase secrets generated successfully."
