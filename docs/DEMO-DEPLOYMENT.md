> **This documentation is no longer maintained here.**
>
> For the latest version, please visit: **[CBrowser MCP Demo Server Deployment](https://cbrowser.ai/docs/DEMO-DEPLOYMENT)**

---

# CBrowser MCP Demo Server Deployment

Deploy a rate-limited, resource-constrained MCP demo server.

## Resource Limits

The demo container is limited to protect your host:

| Resource | Limit | Why |
|----------|-------|-----|
| CPU | 1 core | Prevents CPU exhaustion |
| Memory | 2GB | Playwright needs ~1GB, buffer for operations |
| PIDs | 100 | Prevents fork bombs |
| Tmp storage | 500MB | Limits disk usage |
| Logs | 3 x 10MB | Prevents log explosion |

## Rate Limits (Built-in)

The demo server has application-level rate limiting:
- **5 requests per minute** per IP
- **Burst of 10** requests allowed
- Returns 429 Too Many Requests when exceeded

## Quick Start

```bash
# Clone the repo
git clone https://github.com/alexandriashai/cbrowser.git
cd cbrowser

# Build and run demo container
docker-compose -f docker-compose.demo.yml up -d

# Check status
docker ps
docker logs cbrowser-mcp-demo

# Monitor resources
docker stats cbrowser-mcp-demo
```

## Verify It's Running

```bash
# Health check
curl http://localhost:3000/health

# Server info
curl http://localhost:3000/info
```

## Production Deployment (with nginx)

### 1. Run the container

```bash
docker-compose -f docker-compose.demo.yml up -d
```

### 2. Configure nginx reverse proxy

```nginx
server {
    listen 443 ssl http2;
    server_name cbrowser-mcp-demo.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # Rate limiting at nginx level (additional protection)
    limit_req_zone $binary_remote_addr zone=mcp_demo:10m rate=10r/m;

    location / {
        limit_req zone=mcp_demo burst=5 nodelay;

        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE support for MCP
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 86400;
    }
}
```

### 3. Reload nginx

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Monitoring

### Check container health

```bash
# Status
docker inspect --format='{{.State.Health.Status}}' cbrowser-mcp-demo

# Logs (last 100 lines)
docker logs --tail 100 cbrowser-mcp-demo

# Resource usage
docker stats cbrowser-mcp-demo --no-stream
```

### Set up alerts (optional)

```bash
# Simple health check cron (add to crontab)
*/5 * * * * curl -sf http://localhost:3000/health || echo "MCP Demo Down" | mail -s "Alert" you@email.com
```

## Troubleshooting

### Container keeps restarting

```bash
# Check logs
docker logs cbrowser-mcp-demo

# Common issues:
# - Port 3000 already in use
# - Not enough memory (needs 2GB)
# - Playwright browser install failed
```

### Out of memory

If you see OOM kills, the 2GB limit may not be enough for your workload. Edit `docker-compose.demo.yml`:

```yaml
mem_limit: 3g  # Increase to 3GB
```

### Rate limit too strict

The built-in rate limit is 5 req/min. For a private demo, you can disable it:

```bash
# In docker-compose.demo.yml, add:
environment:
  - MCP_DISABLE_RATE_LIMIT=true  # Only for private demos!
```

## Updating

```bash
# Pull latest
docker-compose -f docker-compose.demo.yml pull

# Recreate container
docker-compose -f docker-compose.demo.yml up -d --force-recreate

# Clean old images
docker image prune -f
```

## Security Considerations

1. **Don't expose without HTTPS** — Use nginx/Caddy with TLS
2. **Keep rate limits on** — The demo is public
3. **Monitor resource usage** — Set up alerts for high CPU/memory
4. **Update regularly** — Keep the container image updated
5. **Consider IP allowlisting** — If demo is for specific users only
