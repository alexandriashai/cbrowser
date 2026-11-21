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

Point `demo.cbrowser.ai` to your server's IP address.

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `https://demo.cbrowser.ai/mcp` | MCP endpoint for claude.ai |
| `https://demo.cbrowser.ai/health` | Health check |
| `https://demo.cbrowser.ai/info` | Server info |

## Claude.ai Custom Connector Setup

1. Go to claude.ai Settings > Integrations > Custom Connectors
2. Click "Add Connector"
3. Enter URL: `https://demo.cbrowser.ai/mcp`
4. Authentication: None (authless)
5. Save and enable

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | HTTP port |
| `HOST` | 0.0.0.0 with authentication, 127.0.0.1 without | Bind address (an open server on any other address logs a warning) |
| `MCP_SESSION_MODE` | stateless | Session mode (stateless or stateful) |
| `CBROWSER_OWN_ADDRESSES` | none | Public addresses that reach this machine without being on one of its network interfaces. See "What the server opens" below |
| `PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK` | unset | Must stay unset. The server refuses to start while it is set. See "What the server opens" below |

## What the server opens

The remote server opens only public internet addresses. It does not open `localhost`, a private network (`10.x`, `172.16` to `172.31`, `192.168.x`, link-local, the IPv6 local ranges) or any address of the machine it runs on. The rule covers the pages its browsers load, including redirects and everything a page loads itself, and the requests the server makes without a browser (the redirect check before a tool runs, the agent-ready audit's fetch of the page without JavaScript, the `llms.txt` tools, the WebMCP checks, `coverage_map`'s sitemap, `security_audit`'s `mcp_url`). When a tool loads a page by its URL and the server does not open it, nothing of the site is loaded and the tool says why in one sentence: the host cannot be reached from the hosted server, or the connection to it failed. `navigate`, `agent_ready_audit`, `llms_txt_generate`, `structured_data_suggest`, `empathy_audit` and `load_session` fail with that sentence; `site_cognitive_assessment`, `cross_browser_diff` and `chaos_test` give it in their result; `manage_tabs` leaves the new tab blank; tools that load the page through `navigate` get its error. A link the page follows by itself to such a host (a click, a script) shows the server's short refusal (plain http) or the browser's own error page (https) in place of the page.

The stdio server (`cbrowser mcp-server`) and the CLI are unchanged. They open whatever the machine can reach, so use one of them to test `localhost` or a site inside your own network.

**The server's own addresses.** The server reads its addresses from its network interfaces and, on Linux, from the kernel's local address table. That is enough on a machine whose public address is on an interface. It is not enough when the public address belongs to something in front of the machine:

- **Docker.** A container sees only its own `172.x` address. The host's public address, which reaches the published port and everything else the host serves, is not visible to the server.
- **NAT.** A cloud machine with a private address on its interface and a public address mapped to it.
- **A load balancer** or a reverse proxy on another machine.

In each of these, set `CBROWSER_OWN_ADDRESSES` to the public addresses that reach the machine, or a caller can ask the server to open them. Entries are separated by commas. Each entry is an IPv4 or IPv6 address, or a range written as an address and a prefix length. An IPv6 address without a prefix length stands for its /64.

```ini
# In the [Service] section of cbrowser-mcp.service: one address, one routed IPv4 block and one IPv6 block.
Environment=CBROWSER_OWN_ADDRESSES=203.0.113.7,198.51.100.8/29,2001:db8:1::/48
```

An entry that is not an address or a range stops the server from starting, and the error names the entry. When the server starts it logs one line with the number of addresses and ranges it refuses as its own:

```
Egress: only public internet addresses are opened. Refused as this server's own: 9 IPv4 and 2 IPv6 addresses or ranges (interfaces, the kernel's local table, CBROWSER_OWN_ADDRESSES).
```

**Playwright's loopback switch.** Do not set `PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK`. With it Chromium connects to the machine's own addresses around the server's address check, so the server refuses to start while it is set.

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
curl https://demo.cbrowser.ai/health
```

### Test MCP connection

```bash
curl -X POST https://demo.cbrowser.ai/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"capabilities":{}}}'
```
