#!/bin/bash

# Function to kill all background processes on exit
cleanup() {
    echo "Stopping all services..."
    kill $(jobs -p)
    exit
}

# Trap Ctrl+C (SIGINT) and call cleanup
trap cleanup SIGINT

# Get the absolute root directory
ROOT_DIR=$(pwd)

# Start Backend
echo "Starting backend..."
cd "$ROOT_DIR/backend" && npm run dev &

# Start Frontend
echo "Starting frontend..."
cd "$ROOT_DIR/frontend" && npm run dev &

# Start Caddy
echo "Starting Caddy..."
cd "$ROOT_DIR" && caddy run &

# Start Ngrok (Keep this in the foreground to keep script alive)
echo "Starting Ngrok..."
sleep 3 # Give other services a moment to bind to their ports
ngrok http 8080
