#!/bin/bash

echo "Starting Exmora Auth setup for Mac..."

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed. Please install it first! You can use Homebrew: brew install node"
    exit 1
fi

echo "Setting up Server..."
cd server || exit

# Remove the old Windows node_modules which might have OS-specific bindings
if [ -d "node_modules" ]; then
    echo "Removing old server node_modules..."
    rm -rf node_modules
fi

echo "Installing server dependencies..."
npm install

cd ..

echo "Setting up Client..."
cd client || exit

# Remove the old Windows node_modules and .next build folder
if [ -d "node_modules" ]; then
    echo "Removing old client node_modules..."
    rm -rf node_modules
fi

if [ -d ".next" ]; then
    echo "Removing old .next build folder..."
    rm -rf .next
fi

echo "Installing client dependencies..."
npm install

echo "=================================================="
echo "Auth Setup Complete!"
echo "To run the Auth package on your Mac:"
echo "  Terminal 1 (Server): cd server && npm start (or npm run dev)"
echo "  Terminal 2 (Client): cd client && npm run dev"
echo "=================================================="
