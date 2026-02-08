#!/bin/bash
# Quick test script for K2-Think API key
# Usage: ./test_k2_key.sh YOUR_API_KEY

API_KEY=${1:-"IFM-FKSKeh0mN28qkOp8"}

echo "Testing K2-Think API with key: ${API_KEY:0:10}..."
echo ""

curl -X POST https://kimi-k2.ai/api/v1/chat/completions \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "kimi-k2-thinking",
    "messages": [{"role": "user", "content": "Say hello"}],
    "max_tokens": 10
  }' \
  -w "\n\nHTTP Status: %{http_code}\n"

echo ""
echo "If you see HTTP Status: 200, the key works!"
echo "If you see HTTP Status: 401, the key is invalid"
