#!/bin/bash
#
# Email OAuth Setup Helper for SMTP Authentication
# This script helps you obtain the initial refresh token needed for OAuth2 SMTP authentication.
#
# Prerequisites:
# 1. The existing Microsoft Entra App Registration (MICROSOFT_ENTRA_CLIENT_ID in wrangler.toml) with:
#    - SMTP.Send and offline_access permissions (delegated, admin consented)
#    - A client secret created
#    - Redirect URI: http://localhost:3939/callback
#
# Usage:
#   ./email-oauth-setup.sh
#
# The script will:
# 1. Use the existing Client ID from wrangler.toml
# 2. Prompt for your Client Secret
# 3. Open a browser for you to sign in
# 4. Start a temporary local server to capture the callback
# 5. Exchange the authorization code for tokens
# 6. Store the refresh token in AUTH_TOKENS KV
#

set -e

# Script directory and wrangler.toml location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WRANGLER_TOML="$SCRIPT_DIR/../wrangler.toml"

# Read configuration from wrangler.toml
if [ ! -f "$WRANGLER_TOML" ]; then
    echo -e "${RED}Error: wrangler.toml not found at $WRANGLER_TOML${NC}"
    exit 1
fi

# Extract values from wrangler.toml (grep for the line, then extract the quoted value)
DEFAULT_TENANT_ID=$(grep 'MICROSOFT_ENTRA_TENANT_ID' "$WRANGLER_TOML" | head -1 | sed 's/.*= *"\([^"]*\)".*/\1/')
DEFAULT_CLIENT_ID=$(grep 'MICROSOFT_ENTRA_CLIENT_ID' "$WRANGLER_TOML" | head -1 | sed 's/.*= *"\([^"]*\)".*/\1/')
KV_NAMESPACE_ID=$(grep -A1 'binding = "AUTH_TOKENS"' "$WRANGLER_TOML" | grep 'id =' | sed 's/.*= *"\([^"]*\)".*/\1/')

if [ -z "$DEFAULT_TENANT_ID" ] || [ -z "$DEFAULT_CLIENT_ID" ]; then
    echo -e "${RED}Error: Could not read MICROSOFT_ENTRA_TENANT_ID or MICROSOFT_ENTRA_CLIENT_ID from wrangler.toml${NC}"
    exit 1
fi

if [ -z "$KV_NAMESPACE_ID" ]; then
    echo -e "${RED}Error: Could not read AUTH_TOKENS KV namespace ID from wrangler.toml${NC}"
    exit 1
fi

REDIRECT_URI="http://localhost:3939/callback"
SCOPES="https://outlook.office365.com/SMTP.Send offline_access"
SCOPES_ENCODED="https%3A%2F%2Foutlook.office365.com%2FSMTP.Send%20offline_access"
KV_KEY="smtp_oauth_refresh_token"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       OAuth2 SMTP Setup Helper for Spark               ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check for required tools
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: 'python3' is required but not installed.${NC}"
    echo "Python 3 is needed to run a local HTTP server for the OAuth callback."
    exit 1
fi

if ! command -v curl &> /dev/null; then
    echo -e "${RED}Error: 'curl' is required but not installed.${NC}"
    exit 1
fi

# Display existing configuration
echo -e "${YELLOW}Step 1: Confirm App Registration details${NC}"
echo ""
echo "Using existing Microsoft Entra configuration from wrangler.toml:"
echo "  Tenant ID: ${DEFAULT_TENANT_ID}"
echo "  Client ID: ${DEFAULT_CLIENT_ID}"
echo ""
echo "If you need to use different values, press Ctrl+C and update wrangler.toml"
echo ""

# Allow override of tenant ID (rare)
read -p "Enter Tenant ID (or press Enter to use default): " TENANT_ID
TENANT_ID="${TENANT_ID:-$DEFAULT_TENANT_ID}"

# Allow override of client ID (rare)
read -p "Enter Client ID (or press Enter to use default): " CLIENT_ID
CLIENT_ID="${CLIENT_ID:-$DEFAULT_CLIENT_ID}"
echo ""

# Prompt for Client Secret
echo "You can find the Client Secret in Microsoft Entra Admin Center:"
echo "  https://entra.microsoft.com → Applications → App registrations → Your App → Certificates & secrets"
echo ""
read -s -p "Enter your Client Secret (will not be displayed): " CLIENT_SECRET
echo ""

if [ -z "$CLIENT_SECRET" ]; then
    echo -e "${RED}Error: Client Secret is required${NC}"
    exit 1
fi

# Prompt for email address
echo ""
read -p "Enter the email address of the mailbox to send from (SMTP_USERNAME): " SMTP_EMAIL

if [ -z "$SMTP_EMAIL" ]; then
    echo -e "${RED}Error: Email address is required${NC}"
    exit 1
fi

# Build authorization URL
AUTH_URL="https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${REDIRECT_URI}&response_mode=query&scope=${SCOPES_ENCODED}&login_hint=${SMTP_EMAIL}"

echo ""
echo -e "${YELLOW}Step 2: Sign in to Microsoft${NC}"
echo ""
echo "A browser window will open. Please sign in with: ${SMTP_EMAIL}"
echo ""
echo -e "${BLUE}Important:${NC} Make sure the redirect URI is configured in your App Registration:"
echo "  ${REDIRECT_URI}"
echo ""
read -p "Press Enter to open browser and start the callback server..."

# Open browser
if command -v open &> /dev/null; then
    open "$AUTH_URL"
elif command -v xdg-open &> /dev/null; then
    xdg-open "$AUTH_URL"
else
    echo ""
    echo "Could not open browser automatically. Please open this URL:"
    echo "$AUTH_URL"
fi

echo ""
echo -e "${YELLOW}Waiting for callback on port 3939...${NC}"
echo "(Sign in and authorize the app in your browser)"
echo ""

# Start a simple HTTP server to capture the callback
TEMP_REQUEST=$(mktemp)
trap "rm -f $TEMP_REQUEST" EXIT

# Use Python for reliable HTTP handling
TEMP_REQUEST="$TEMP_REQUEST" python3 << 'PYTHON_SERVER'
import http.server
import socketserver
import os

class OAuthCallbackHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        # Save the request path (contains the auth code)
        temp_file = os.environ.get('TEMP_REQUEST', '/tmp/oauth_request')
        with open(temp_file, 'w') as f:
            f.write(f'GET {self.path} HTTP/1.1')
        
        # Send success response
        self.send_response(200)
        self.send_header('Content-type', 'text/html')
        self.end_headers()
        response = b'<html><body><h1>&#10004; Authorization successful!</h1><p>You can close this window and return to the terminal.</p></body></html>'
        self.wfile.write(response)
    
    def log_message(self, format, *args):
        pass  # Suppress logging

# Allow address reuse to avoid "Address already in use" errors
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('', 3939), OAuthCallbackHandler) as httpd:
    httpd.handle_request()
PYTHON_SERVER

# Read the captured request
RESPONSE=$(cat "$TEMP_REQUEST" 2>/dev/null)

# Extract the authorization code from the request
# Request looks like: GET /callback?code=xxx&session_state=yyy HTTP/1.1
CODE=$(echo "$RESPONSE" | sed -n 's/.*code=\([^&]*\).*/\1/p')

if [ -z "$CODE" ]; then
    echo -e "${RED}Error: Could not extract authorization code from callback${NC}"
    echo "Response was: $RESPONSE"
    exit 1
fi

echo -e "${GREEN}✓ Received authorization code${NC}"
echo ""
echo -e "${YELLOW}Step 3: Exchanging code for tokens...${NC}"

# Exchange authorization code for tokens
TOKEN_RESPONSE=$(curl -s -X POST "https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "client_id=${CLIENT_ID}" \
    -d "client_secret=${CLIENT_SECRET}" \
    -d "code=${CODE}" \
    -d "redirect_uri=${REDIRECT_URI}" \
    -d "grant_type=authorization_code" \
    -d "scope=${SCOPES}")

# Check for errors
if echo "$TOKEN_RESPONSE" | grep -q '"error"'; then
    ERROR=$(echo "$TOKEN_RESPONSE" | grep -o '"error_description":"[^"]*"' | cut -d'"' -f4)
    echo -e "${RED}Error getting tokens: ${ERROR}${NC}"
    echo ""
    echo "Full response:"
    echo "$TOKEN_RESPONSE"
    exit 1
fi

# Extract refresh token
REFRESH_TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"refresh_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$REFRESH_TOKEN" ]; then
    echo -e "${RED}Error: No refresh token in response${NC}"
    echo "Make sure 'offline_access' scope is included and consented."
    echo ""
    echo "Full response:"
    echo "$TOKEN_RESPONSE"
    exit 1
fi

# Success!
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    ✅ SUCCESS!                             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Store refresh token in KV
echo -e "${YELLOW}Step 4: Storing refresh token in AUTH_TOKENS KV...${NC}"
echo ""

# Check if wrangler is available
if command -v wrangler &> /dev/null || command -v npx &> /dev/null; then
    echo "Would you like to store the refresh token in AUTH_TOKENS KV now?"
    read -p "Store in KV? (Y/n): " STORE_KV
    
    if [ "$STORE_KV" != "n" ] && [ "$STORE_KV" != "N" ]; then
        cd "$(dirname "$0")/.."
        
        if command -v wrangler &> /dev/null; then
            wrangler kv:key put --namespace-id="${KV_NAMESPACE_ID}" "${KV_KEY}" "${REFRESH_TOKEN}"
        else
            npx wrangler kv:key put --namespace-id="${KV_NAMESPACE_ID}" "${KV_KEY}" "${REFRESH_TOKEN}"
        fi
        
        echo -e "${GREEN}✓ Refresh token stored in AUTH_TOKENS KV${NC}"
    else
        echo ""
        echo "To store the refresh token manually, run:"
        echo -e "${BLUE}  cd cloudflare${NC}"
        echo -e "${BLUE}  wrangler kv:key put --namespace-id=\"${KV_NAMESPACE_ID}\" \"${KV_KEY}\" \"<refresh_token>\"${NC}"
        echo ""
        echo "Refresh token value:"
        echo "${REFRESH_TOKEN}"
    fi
else
    echo -e "${YELLOW}wrangler not found. Store the refresh token manually:${NC}"
    echo ""
    echo "Run from cloudflare/ directory:"
    echo -e "${BLUE}  wrangler kv:key put --namespace-id=\"${KV_NAMESPACE_ID}\" \"${KV_KEY}\" \"<refresh_token>\"${NC}"
    echo ""
    echo "Refresh token value:"
    echo "${REFRESH_TOKEN}"
fi

echo ""
echo -e "${YELLOW}Step 5: Configure Cloudflare Secrets${NC}"
echo ""
echo "Add these secrets to Cloudflare Secret Store (if not already done):"
echo ""
echo -e "  ${BLUE}SPARK_SMTP_USERNAME${NC}=${SMTP_EMAIL}"
echo -e "  ${BLUE}SPARK_MICROSOFT_ENTRA_CLIENT_SECRET${NC}=<your client secret>"
echo ""
if [ "$TENANT_ID" != "$DEFAULT_TENANT_ID" ]; then
    echo -e "${YELLOW}⚠️  You're using a non-default tenant. Also update wrangler.toml:${NC}"
    echo "   MICROSOFT_ENTRA_TENANT_ID = \"${TENANT_ID}\""
    echo ""
fi
echo -e "${BLUE}Notes:${NC}"
echo "• Refresh token: Valid for 90 days of inactivity (auto-refreshed on each email send)"
echo "• Client secret: Expires per your Entra config (max 24 months). Set a calendar reminder!"
echo "  When rotating: update SPARK_MICROSOFT_ENTRA_CLIENT_SECRET in Cloudflare (no re-auth needed)"
echo ""

# Offer to append client secret to .secrets (for local dev)
SECRETS_FILE="$(dirname "$0")/../.secrets"
if [ -f "$SECRETS_FILE" ]; then
    echo -e "${YELLOW}Would you like to add secrets to your local .secrets file (for local dev)?${NC}"
    read -p "Append to .secrets? (y/N): " APPEND_CHOICE
    
    if [ "$APPEND_CHOICE" = "y" ] || [ "$APPEND_CHOICE" = "Y" ]; then
        echo "" >> "$SECRETS_FILE"
        echo "# SMTP OAuth2 Configuration (added by oauth-setup.sh)" >> "$SECRETS_FILE"
        echo "SPARK_SMTP_USERNAME=${SMTP_EMAIL}" >> "$SECRETS_FILE"
        echo "SPARK_MICROSOFT_ENTRA_CLIENT_SECRET=${CLIENT_SECRET}" >> "$SECRETS_FILE"
        echo ""
        echo -e "${GREEN}✓ Added to .secrets file${NC}"
    fi
fi

echo ""
echo -e "${GREEN}You're all set! Run 'npm run dev' to test email sending.${NC}"
echo ""
