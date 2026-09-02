#!/bin/bash

# 1. Start the Backend
echo "Starting Backend..."
cd /backend && npm run dev &
# Save the process ID to kill it later if needed
BACKEND_PID=$!

# 2. Start the Frontend
echo "Starting Frontend..."
cd /frontend && npm run dev &
FRONTEND_PID=$!

# 3. Start Caddy
echo "Starting Caddy..."
# Assumes you have a Caddyfile in the current directory or globally configured
caddy run 
CADDY_PID=$!

echo "All services started!"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Caddy PID: $CADDY_PID"

# Wait for all background processes to finish (keeps the script running)
wait
