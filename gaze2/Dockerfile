FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    libgstreamer1.0-0 \
    libgstreamer-plugins-base1.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install gazefollower
RUN pip install --no-cache-dir gazefollower

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p data logs

# Expose API port
EXPOSE 5000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV GAZE_API_HOST=0.0.0.0
ENV GAZE_API_PORT=5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python3 -c "import requests; requests.get('http://localhost:5000/health')" || exit 1

# Run the application
CMD ["python3", "main.py", "--mode", "api"]
