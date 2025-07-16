# Cloudflare + GitHub Pages Configuration Guide

## DNS Configuration in Cloudflare

### For Apex Domain (bubblenews.today):

1. **A Records** (pointing to GitHub Pages IPs):
   - Type: A
   - Name: @
   - IPv4 address: 185.199.108.153
   - Proxy status: Proxied (orange cloud ON)
   
   Add all four GitHub Pages IPs:
   - 185.199.108.153
   - 185.199.109.153
   - 185.199.110.153
   - 185.199.111.153

2. **AAAA Records** (IPv6 - optional but recommended):
   - Type: AAAA
   - Name: @
   - IPv6 address: 2606:50c0:8000::153
   - Proxy status: Proxied (orange cloud ON)
   
   Add all four GitHub Pages IPv6 addresses:
   - 2606:50c0:8000::153
   - 2606:50c0:8001::153
   - 2606:50c0:8002::153
   - 2606:50c0:8003::153

3. **WWW Subdomain** (optional):
   - Type: CNAME
   - Name: www
   - Target: bubblenews.today
   - Proxy status: Proxied (orange cloud ON)

## Cloudflare Settings

### SSL/TLS Configuration:
1. **SSL/TLS → Overview**: Set to "Full" (NOT "Full (strict)")
2. **SSL/TLS → Edge Certificates**: 
   - Always Use HTTPS: ON
   - Automatic HTTPS Rewrites: ON
   - Minimum TLS Version: TLS 1.2

### Page Rules (optional but recommended):
Create a page rule for `*bubblenews.today/*`:
- Always Use HTTPS: ON
- Cache Level: Standard
- SSL: Full

### Caching:
1. **Caching → Configuration**:
   - Browser Cache TTL: Respect Existing Headers
   - Crawler Hints: ON

## GitHub Pages Configuration

1. **Repository Settings → Pages**:
   - Source: Deploy from a branch
   - Branch: main (or gh-pages)
   - Folder: / (root) or /docs
   - Custom domain: bubblenews.today
   - Enforce HTTPS: ON (after certificate provisioning)

2. **CNAME File**:
   - Location: `/static/CNAME` (for Hugo)
   - Content: `bubblenews.today` (single line, no protocol)

## Troubleshooting SSL_VERSION_OR_CIPHER_MISMATCH

If you're still seeing the error after configuration:

1. **Wait for propagation**: DNS changes can take up to 48 hours
2. **Clear Cloudflare cache**: Purge Everything in Caching → Configuration
3. **Check SSL mode**: Must be "Full", not "Flexible" or "Full (strict)"
4. **Disable Universal SSL temporarily**: SSL/TLS → Edge Certificates → Disable Universal SSL, wait 10 minutes, then re-enable
5. **Check GitHub Pages status**: https://www.githubstatus.com/

## Verification Commands

```bash
# Check DNS resolution
dig bubblenews.today

# Check SSL certificate
openssl s_client -servername bubblenews.today -connect bubblenews.today:443

# Test HTTPS connectivity
curl -I https://bubblenews.today

# Check if proxied through Cloudflare
curl -I https://bubblenews.today | grep -i "cf-ray"
```

## Expected Results

When properly configured:
- DNS resolves to Cloudflare IPs (not GitHub directly)
- SSL certificate shows Cloudflare as issuer
- No SSL errors when accessing the site
- GitHub Pages serves content through Cloudflare proxy