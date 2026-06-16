#!/bin/bash
# Launch Chrome with CORS disabled for Analytics Query Tool
# This creates a separate Chrome instance just for development - don't use for regular browsing!

echo "🚀 Launching Chrome with CORS disabled for Analytics Query Tool..."
echo "⚠️  WARNING: Only use this instance for the analytics tool - don't browse other sites!"
echo ""

# Detect OS and launch appropriate command
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  open -na "Google Chrome" --args \
    --user-data-dir=/tmp/chrome-dev-analytics \
    --disable-web-security \
    --disable-site-isolation-trials \
    "file://$(pwd)/index.html"
  echo "✅ Chrome launched on macOS"
  
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
  # Linux
  google-chrome \
    --user-data-dir=/tmp/chrome-dev-analytics \
    --disable-web-security \
    --disable-site-isolation-trials \
    "file://$(pwd)/index.html" &
  echo "✅ Chrome launched on Linux"
  
else
  # Windows (Git Bash or WSL)
  echo "Windows detected. Please run this command manually:"
  echo ""
  echo '"C:\Program Files\Google\Chrome\Application\chrome.exe" --user-data-dir=C:\temp\chrome-dev-analytics --disable-web-security'
  echo ""
  echo "Then navigate to: file://$(pwd)/index.html"
fi

echo ""
echo "📖 Remember to:"
echo "   1. Add your Cloudflare API token in the Configuration section"
echo "   2. Click 'Save Configuration'"
echo "   3. Click 'Test Connection' to verify it works"
