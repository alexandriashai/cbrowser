# Remote MCP Server Deployment Guide

Deploy CBrowser as a remote MCP server for claude.ai custom connectors. This allows your entire team to use CBrowser through Claude without local installation.

## Architecture Overview

```
┌─────────────────┐     HTTPS      ┌─────────────────┐     HTTP      ┌─────────────────┐
│   claude.ai     │ ──────────────>│  Nginx/Caddy    │ ────────────> │ CBrowser MCP    │
│  (Custom MCP)   │   :443         │  Reverse Proxy  │  :3100        │    Server       │
└─────────────────┘                └─────────────────┘               └─────────────────┘
                                          │
                                   ┌──────┴──────┐
                                   │ Cloudflare  │ (optional)
                                   │   or SSL    │
                                   └─────────────┘
```

## Prerequisites

### System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| **OS** | Ubuntu 20.04+ / Debian 11+ | Ubuntu 22.04 LTS |
| **RAM** | 2 GB | 4 GB |
| **CPU** | 2 cores | 4 cores |
| **Storage** | 10 GB | 20 GB |
| **Node.js** | 18.x | 20.x LTS |

### Required Software

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install nginx
sudo apt install -y nginx

# Verify installations
node --version  # Should be v20.x
nginx -v        # Should show nginx version
```

### Domain & DNS

You'll need:
- A domain name (e.g., `cbrowser-mcp.yourdomain.com`)
- DNS A record pointing to your server's IP
- SSL certificate (Let's Encrypt or Cloudflare Origin)

---

## Step 1: Install CBrowser

```bash
# Create application directory
sudo mkdir -p /opt/cbrowser
cd /opt/cbrowser

# Install CBrowser globally or locally
npm init -y
npm install cbrowser

# Install Playwright browsers
npx playwright install chromium firefox webkit
npx playwright install-deps  # Install system dependencies

# Create data directory
sudo mkdir -p /home/$USER/.cbrowser/{sessions,screenshots,videos,har,personas,scenarios,helpers,audit,baselines,browser-state,cache,journeys,performance,visual,tests,repairs,config,visual-baselines,cross-browser,responsive,ab-comparison}
sudo chown -R $USER:$USER /home/$USER/.cbrowser
```

---

## Step 2: Create Systemd Service

Create the service file:

```bash
sudo nano /etc/systemd/system/cbrowser-mcp.service
```

Paste this configuration:

```ini
[Unit]
Description=CBrowser Remote MCP Server
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
Group=YOUR_GROUP
WorkingDirectory=/opt/cbrowser

# Create data directories on startup
ExecStartPre=/bin/bash -c 'mkdir -p /home/YOUR_USERNAME/.cbrowser/{sessions,screenshots,videos,har,personas,scenarios,helpers,audit,baselines,browser-state,cache,journeys,performance,visual,tests,repairs,config,visual-baselines,cross-browser,responsive,ab-comparison}'

# Start the MCP server
ExecStart=/usr/bin/node node_modules/cbrowser/dist/mcp-server-remote.js

Restart=on-failure
RestartSec=5

# Environment
Environment=NODE_ENV=production
Environment=PORT=3100
Environment=HOST=127.0.0.1
Environment=MCP_SESSION_MODE=stateless
Environment=CBROWSER_DATA_DIR=/home/YOUR_USERNAME/.cbrowser

# Security hardening (optional but recommended)
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=read-only
PrivateTmp=yes
ReadWritePaths=/opt/cbrowser /home/YOUR_USERNAME/.cbrowser /home/YOUR_USERNAME/.cache/ms-playwright

[Install]
WantedBy=multi-user.target
```

**Important:** Replace `YOUR_USERNAME` and `YOUR_GROUP` with your actual user/group.

Enable and start the service:

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable on boot
sudo systemctl enable cbrowser-mcp

# Start the service
sudo systemctl start cbrowser-mcp

# Check status
sudo systemctl status cbrowser-mcp
```

Verify it's running:

```bash
curl http://localhost:3100/health
# Should return: {"status":"ok","version":"7.x.x"}
```

---

## Step 3: Configure Nginx Reverse Proxy

Create nginx configuration:

```bash
sudo nano /etc/nginx/sites-available/cbrowser-mcp.conf
```

### Option A: With Cloudflare (Recommended)

```nginx
# HTTP redirect to HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name cbrowser-mcp.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

# HTTPS with Cloudflare Origin Certificate
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name cbrowser-mcp.yourdomain.com;

    # Cloudflare Origin Certificate
    ssl_certificate /etc/ssl/certs/yourdomain-origin.pem;
    ssl_certificate_key /etc/ssl/private/yourdomain-origin.key;

    # SSL security settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;

    # Reverse proxy to MCP server
    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;

        # WebSocket/SSE support for MCP
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # Standard proxy headers
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Extended timeouts for long-running MCP operations
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;

        # Disable buffering for SSE
        proxy_buffering off;
        proxy_cache off;

        # MCP session header passthrough
        proxy_pass_header Mcp-Session-Id;
    }

    # Logging
    access_log /var/log/nginx/cbrowser-mcp.access.log;
    error_log /var/log/nginx/cbrowser-mcp.error.log;
}
```

### Option B: With Let's Encrypt

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d cbrowser-mcp.yourdomain.com
```

Enable the site:

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/cbrowser-mcp.conf /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

---

## Step 4: Cloudflare Configuration (Optional)

If using Cloudflare:

### DNS Settings

1. Add an **A record**:
   - Name: `cbrowser-mcp`
   - IPv4 address: Your server IP
   - Proxy status: **Proxied** (orange cloud)

### SSL/TLS Settings

1. Go to **SSL/TLS → Overview**
2. Set encryption mode to **Full (strict)**

### Origin Certificates

1. Go to **SSL/TLS → Origin Server**
2. Click **Create Certificate**
3. Generate with:
   - Key type: RSA (2048)
   - Hostnames: `cbrowser-mcp.yourdomain.com`
   - Validity: 15 years
4. Download and save:
   - Certificate → `/etc/ssl/certs/yourdomain-origin.pem`
   - Private key → `/etc/ssl/private/yourdomain-origin.key`

### Page Rules (Recommended)

Create a page rule to bypass caching:

1. Go to **Rules → Page Rules**
2. Create rule:
   - URL: `cbrowser-mcp.yourdomain.com/*`
   - Setting: **Cache Level → Bypass**

---

## Step 5: Test the Deployment

### Health Check

```bash
curl https://cbrowser-mcp.yourdomain.com/health
# {"status":"ok","version":"7.4.2"}
```

### Info Endpoint

```bash
curl https://cbrowser-mcp.yourdomain.com/info
```

### MCP Initialize (for debugging)

```bash
curl -X POST https://cbrowser-mcp.yourdomain.com/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}'
```

---

## Step 6: Connect to Claude.ai

1. Go to [claude.ai](https://claude.ai)
2. Open **Settings → Integrations → Custom MCP Servers**
3. Add new connector:
   - **Name:** CBrowser
   - **URL:** `https://cbrowser-mcp.yourdomain.com/mcp`
4. Click **Connect**

You should see 31 CBrowser tools become available in Claude.

---

## Security Considerations

### Firewall Rules

```bash
# Allow only necessary ports
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (redirect)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### Authentication (Future)

The current MCP server is open. For production with sensitive data:

1. Use Cloudflare Access for authentication
2. Or add API key validation (coming in future version)
3. Or restrict to IP whitelist in nginx

### Rate Limiting

Add to nginx config:

```nginx
# In http block of /etc/nginx/nginx.conf
limit_req_zone $binary_remote_addr zone=mcp:10m rate=10r/s;

# In server block
location / {
    limit_req zone=mcp burst=20 nodelay;
    # ... rest of config
}
```

---

## Monitoring

### View Logs

```bash
# Service logs
sudo journalctl -u cbrowser-mcp -f

# Nginx access logs
sudo tail -f /var/log/nginx/cbrowser-mcp.access.log

# Nginx error logs
sudo tail -f /var/log/nginx/cbrowser-mcp.error.log
```

### Health Check Script

Create `/opt/cbrowser/healthcheck.sh`:

```bash
#!/bin/bash
response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/health)
if [ "$response" != "200" ]; then
    echo "CBrowser MCP unhealthy, restarting..."
    sudo systemctl restart cbrowser-mcp
fi
```

Add to cron:

```bash
# Run every 5 minutes
*/5 * * * * /opt/cbrowser/healthcheck.sh
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
sudo journalctl -u cbrowser-mcp -n 50 --no-pager

# Common fixes:
# 1. Permission issues
sudo chown -R $USER:$USER /home/$USER/.cbrowser
sudo chmod -R 755 /home/$USER/.cbrowser

# 2. Missing Playwright browsers
cd /opt/cbrowser && npx playwright install

# 3. Port already in use
sudo lsof -i :3100
```

### "Read-only filesystem" Error

The systemd security hardening may be too restrictive:

```bash
# Check ReadWritePaths includes all needed directories
sudo systemctl cat cbrowser-mcp | grep ReadWritePaths
```

### Browser Timeout Errors

```bash
# Install all browser dependencies
npx playwright install-deps

# Or install specific deps for Ubuntu
sudo apt install -y libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 \
  libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2
```

### Cloudflare 522 Errors

1. Verify nginx is running: `sudo systemctl status nginx`
2. Check CBrowser is listening: `curl localhost:3100/health`
3. Check firewall allows 443: `sudo ufw status`

### MCP Connection Fails in Claude

1. Verify URL is correct: `https://your-domain/mcp` (not `/mcp/`)
2. Check SSL certificate: `curl -v https://your-domain/health`
3. Verify Accept header support (claude.ai sends `Accept: application/json, text/event-stream`)

---

## Updating CBrowser

```bash
# Stop service
sudo systemctl stop cbrowser-mcp

# Update package
cd /opt/cbrowser
npm update cbrowser

# Restart service
sudo systemctl start cbrowser-mcp

# Verify version
curl https://cbrowser-mcp.yourdomain.com/health
```

---

## Alternative: Docker Deployment

Coming soon. See [Docker documentation](./DOCKER.md).

---

## Getting Help

- **Issues:** [GitHub Issues](https://github.com/alexandriashai/cbrowser/issues)
- **Discussions:** [GitHub Discussions](https://github.com/alexandriashai/cbrowser/discussions)
- **Examples:** See the `deployment/` directory for reference configs
