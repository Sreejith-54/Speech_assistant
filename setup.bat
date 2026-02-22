@echo off
echo === Setting up Vocalis project ===

echo === Setting up frontend ===
cd frontend
call npm install
cd ..

echo === Setting up backend environment ===
python -m venv .venv
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
    pip3 install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124
)

echo === Setup complete! ===
echo Run 'run.bat' to start the application
