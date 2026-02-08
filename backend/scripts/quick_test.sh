#!/bin/bash
# Quick test script for backend

echo "=========================================="
echo "ThirdEye Backend Quick Test"
echo "=========================================="
echo ""

# Check if API is running
echo "1. Checking if API is running..."
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo "   ✓ API is running"
else
    echo "   ✗ API is NOT running"
    echo "   → Start it with: uvicorn app.main:app --reload"
    exit 1
fi

# Test health endpoint
echo ""
echo "2. Testing health endpoint..."
response=$(curl -s http://localhost:8000/health)
if [[ $response == *"healthy"* ]]; then
    echo "   ✓ Health check passed: $response"
else
    echo "   ✗ Health check failed: $response"
fi

# Test root endpoint
echo ""
echo "3. Testing root endpoint..."
response=$(curl -s http://localhost:8000/)
if [[ $response == *"status"* ]]; then
    echo "   ✓ Root endpoint works"
else
    echo "   ✗ Root endpoint failed: $response"
fi

# Test protected endpoint (should return 401)
echo ""
echo "4. Testing protected endpoint (expect 401)..."
status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/api/personal/profile)
if [ "$status" == "401" ] || [ "$status" == "403" ]; then
    echo "   ✓ Protected endpoint correctly returns $status"
else
    echo "   ⚠ Protected endpoint returned $status (expected 401/403)"
fi

echo ""
echo "=========================================="
echo "Quick test complete!"
echo "=========================================="
echo ""
echo "For full verification, run: python3 scripts/verify_backend.py"
