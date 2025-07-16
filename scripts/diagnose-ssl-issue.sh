#!/bin/bash

# SSL Diagnostic Script for bubblenews.today
DOMAIN="bubblenews.today"

echo "=== SSL/TLS Diagnostic for $DOMAIN ==="
echo "Date: $(date)"
echo ""

# Function to check SSL with timeout
check_ssl() {
    local host=$1
    echo "Checking SSL for $host..."
    timeout 10 openssl s_client -servername $host -connect $host:443 -showcerts </dev/null 2>/dev/null | grep -E "(subject=|issuer=|Verify return code)" || echo "SSL check failed or timed out"
    echo ""
}

# 1. Check current DNS resolution
echo "1. DNS Resolution Check:"
echo "   A records:"
dig +short A $DOMAIN | while read ip; do
    echo "   - $ip"
    # Check if it's a Cloudflare IP
    whois $ip 2>/dev/null | grep -i "orgname\|netname" | head -1 || echo "     (Could not determine owner)"
done
echo ""

# 2. Check if domain is accessible
echo "2. HTTP/HTTPS Accessibility:"
echo -n "   HTTP (80): "
timeout 5 curl -sI http://$DOMAIN | head -1 || echo "Not accessible"
echo -n "   HTTPS (443): "
timeout 5 curl -sI https://$DOMAIN | head -1 || echo "Not accessible"
echo ""

# 3. Check SSL certificate details
echo "3. SSL Certificate Details:"
check_ssl $DOMAIN

# 4. Check GitHub Pages directly (bypassing Cloudflare)
echo "4. GitHub Pages Direct Check:"
GITHUB_USER="DylanDDeng"  # From your wrangler.toml
GITHUB_PAGES_DOMAIN="${GITHUB_USER}.github.io"
echo "   Checking $GITHUB_PAGES_DOMAIN..."
dig +short $GITHUB_PAGES_DOMAIN
check_ssl $GITHUB_PAGES_DOMAIN

# 5. Check specific SSL/TLS versions
echo "5. SSL/TLS Version Support:"
for version in tls1 tls1_1 tls1_2 tls1_3; do
    echo -n "   ${version}: "
    timeout 5 openssl s_client -servername $DOMAIN -connect $DOMAIN:443 -${version} </dev/null 2>&1 | grep -q "CONNECTED" && echo "Supported" || echo "Not supported"
done
echo ""

# 6. Check Cloudflare headers
echo "6. Cloudflare Headers Check:"
curl -sI https://$DOMAIN 2>/dev/null | grep -iE "(cf-ray|cf-cache-status|server)" || echo "No Cloudflare headers found"
echo ""

# 7. Recommendations
echo "7. Recommendations based on findings:"
echo ""
echo "If you see SSL_VERSION_OR_CIPHER_MISMATCH:"
echo "1. In Cloudflare: SSL/TLS → Overview → Set to 'Full' (not 'Full (strict)')"
echo "2. Wait 5-10 minutes for changes to propagate"
echo "3. Clear browser cache and try again"
echo ""
echo "If the issue persists:"
echo "1. Temporarily disable Cloudflare proxy (gray cloud) to test direct GitHub Pages access"
echo "2. Check if your GitHub Pages site is accessible at: https://${GITHUB_USER}.github.io/ai-bubblebrain-daily-news/"
echo "3. Ensure CNAME file exists in your repository's root or publishing directory"