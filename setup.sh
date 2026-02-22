#!/bin/bash
# Note: You may need to make this script executable with: chmod +x setup.sh

echo "=== Setting up Vocalis project ==="

echo "=== Setting up frontend ==="
cd frontend
npm install
cd ..

echo "=== Setting up backend environment ==="
python3 -m venv env
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

echo "=== Setup complete! ==="
echo "Run './run.sh' to start the application"
