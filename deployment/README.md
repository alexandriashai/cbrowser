# CBrowser Remote MCP Server Deployment

## Quick Start

### 1. Install the systemd service

```bash
# Copy service file
sudo cp cbrowser-mcp.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable cbrowser-mcp
sudo systemctl start cbrowser-mcp

# Check status
sudo systemctl status cbrowser-mcp
```

### 2. Configure Caddy reverse proxy

Add the contents of `Caddyfile.cbrowser-mcp` to your Caddyfile:

```bash
# Reload Caddy
sudo systemctl reload caddy
```

### 3. Set up DNS

Point `cbrowser-mcp.wyldfyre.ai` to your server's IP address.

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `https://cbrowser-mcp.wyldfyre.ai/mcp` | MCP endpoint for claude.ai |
| `https://cbrowser-mcp.wyldfyre.ai/health` | Health check |
| `https://cbrowser-mcp.wyldfyre.ai/info` | Server info |

## Claude.ai Custom Connector Setup

1. Go to claude.ai Settings > Integrations > Custom Connectors
2. Click "Add Connector"
3. Enter URL: `https://cbrowser-mcp.wyldfyre.ai/mcp`
4. Authentication: None (authless)
5. Save and enable

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | HTTP port |
| `HOST` | 0.0.0.0 | Bind address |
| `MCP_SESSION_MODE` | stateless | Session mode (stateless or stateful) |

## Logs

```bash
# Service logs
sudo journalctl -u cbrowser-mcp -f

# Caddy access logs
sudo tail -f /var/log/caddy/cbrowser-mcp.log
```

## Troubleshooting

### Check if service is running

```bash
curl http://localhost:3100/health
```

### Check if external access works

```bash
curl https://cbrowser-mcp.wyldfyre.ai/health
```

### Test MCP connection

```bash
curl -X POST https://cbrowser-mcp.wyldfyre.ai/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"capabilities":{}}}'
```
