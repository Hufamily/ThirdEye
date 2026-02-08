#!/bin/bash
# Production startup script for Gaze Tracker

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Gaze Tracker...${NC}"

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Warning: .env file not found. Using defaults.${NC}"
    echo -e "${YELLOW}Copy .env.example to .env to customize settings.${NC}"
fi

# Create necessary directories
mkdir -p data logs

# Check Python version
python3 --version

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Creating virtual environment...${NC}"
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install/update dependencies
echo -e "${GREEN}Installing dependencies...${NC}"
pip install -q --upgrade pip
pip install -q -r requirements.txt

# Check if gazefollower is installed
if ! python3 -c "import gazefollower" 2>/dev/null; then
    echo -e "${YELLOW}Installing gazefollower package...${NC}"
    pip install -q gazefollower
fi

# Run the application
echo -e "${GREEN}Starting application...${NC}"
python3 main.py "$@"
