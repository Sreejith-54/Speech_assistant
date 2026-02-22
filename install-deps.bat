@echo off
echo === Updating Vocalis dependencies ===

echo === Updating frontend dependencies ===
cd frontend
call npm install
cd ..

echo === Updating backend dependencies ===
call .\.venv\Scripts\activate

echo.
echo Would you like to install PyTorch with CUDA support?
echo 1. Yes - Install with CUDA support (recommended for NVIDIA GPUs)
echo 2. No - Use CPU only
choice /c 12 /n /m "Enter your choice (1 or 2): "

if errorlevel 2 (
    echo === Installing with CPU support only ===
    python -m pip install -r backend\requirements.txt
) else (
    echo === Installing with CUDA support ===
    python -m pip install -r backend\requirements.txt
    echo === Installing PyTorch with CUDA support ===
    python -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124
)

echo === Dependencies updated! ===
