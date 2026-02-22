#!/bin/bash
# Note: You may need to make this script executable with: chmod +x install-deps.sh

echo "=== Updating Vocalis dependencies ==="

echo "=== Updating frontend dependencies ==="
cd frontend
npm install
cd ..

echo "=== Updating backend dependencies ==="
source ./env/bin/activate

echo
echo "Would you like to install PyTorch with CUDA support?"
echo "1. Yes - Install with CUDA support (recommended for NVIDIA GPUs)"
echo "2. No - Use CPU only"
read -p "Enter your choice (1 or 2): " choice

if [ "$choice" = "1" ]; then
    echo "=== Installing with CUDA support ==="
    pip install -r backend/requirements.txt
    echo "=== Installing PyTorch with CUDA support ==="
    pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124
else
    echo "=== Installing with CPU support only ==="
    pip install -r backend/requirements.txt
fi

echo "=== Dependencies updated! ==="
