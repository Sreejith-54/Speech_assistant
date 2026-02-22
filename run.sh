#!/bin/bash
# Note: You may need to make this script executable with: chmod +x run.sh

echo "=== Starting Vocalis ==="

# Determine which terminal command to use based on OS and available commands
terminal_cmd=""
if [ "$(uname)" == "Darwin" ]; then
    # macOS (try to use Terminal.app)
    if command -v osascript &> /dev/null; then
        terminal_cmd="osascript"
    fi
elif command -v gnome-terminal &> /dev/null; then
    terminal_cmd="gnome-terminal"
elif command -v xterm &> /dev/null; then
    terminal_cmd="xterm"
elif command -v konsole &> /dev/null; then
    terminal_cmd="konsole"
fi

# Start backend server
if [ "$terminal_cmd" == "osascript" ]; then
    # macOS specific approach
    osascript -e 'tell app "Terminal" to do script "cd \"'$(pwd)'\" && source ./env/bin/activate && python -m backend.main"'
elif [ -n "$terminal_cmd" ]; then
    # For Linux with available terminal
    $terminal_cmd -- bash -c "cd '$(pwd)' && source ./env/bin/activate && python -m backend.main; exec bash" &
else
    # Fallback - start in background
    echo "Could not detect terminal. Starting services in background."
    source ./env/bin/activate && python -m backend.main &
    BACKEND_PID=$!
    echo "Backend started with PID: $BACKEND_PID"
fi

# Wait a moment for backend to initialize
sleep 2

# Start frontend server
if [ "$terminal_cmd" == "osascript" ]; then
    # macOS specific approach
    osascript -e 'tell app "Terminal" to do script "cd \"'$(pwd)'/frontend\" && npm run dev"'
elif [ -n "$terminal_cmd" ]; then
    # For Linux with available terminal
    $terminal_cmd -- bash -c "cd '$(pwd)/frontend' && npm run dev; exec bash" &
else
    # Fallback - start in background
    cd frontend && npm run dev &
    FRONTEND_PID=$!
    echo "Frontend started with PID: $FRONTEND_PID"
    cd ..
fi

echo "=== Vocalis servers started ==="
echo "Frontend: http://localhost:5173 (or your Vite port)"
echo "Backend: http://localhost:8000 (or your FastAPI port)"

# For fallback mode, provide instructions to terminate
if [ -z "$terminal_cmd" ]; then
    echo
    echo "Since services are running in the background, use the following to terminate:"
    echo "  kill $BACKEND_PID $FRONTEND_PID"
    # Keep script running to make it easier to terminate
    echo "Press Ctrl+C to terminate all services and exit"
    trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
    wait
fi
