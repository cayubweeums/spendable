# spendable

Spendable copies balances from SimpleFIN and shows how much you can spend right now. The copied balances stay as the bank reported them.

## Quick start

Save this as `docker-compose.yml`:

```yaml
services:
  spendable:
    image: ghcr.io/cayubweeums/spendable:latest
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - spendable-data:/app/data
    restart: unless-stopped

volumes:
  spendable-data:
```

```bash
docker compose up -d
```

Open http://127.0.0.1:3000.

## MCP

After setting up an account, Bank -> New -> name your token and provide it to your agent of choice via the details below.

### Cursor

`~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "spendable": {
      "url": "http://127.0.0.1:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer PASTE"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add --transport http spendable http://127.0.0.1:3000/api/mcp \
  --header "Authorization: Bearer PASTE"
```

### VS Code

`.vscode/mcp.json`

```json
{
  "servers": {
    "spendable": {
      "type": "http",
      "url": "http://127.0.0.1:3000/api/mcp",
      "headers": {
        "Authorization": "Bearer PASTE"
      }
    }
  }
}
```

### Codex

`~/.codex/config.toml`

```toml
[mcp_servers.spendable]
url = "http://127.0.0.1:3000/api/mcp"
http_headers = { Authorization = "Bearer PASTE" }
```

### Hermes

`~/.hermes/config.yaml`

```yaml
mcp_servers:
  spendable:
    url: "http://127.0.0.1:3000/api/mcp"
    headers:
      Authorization: "Bearer PASTE"
```

### Claude Desktop

Settings, Developer, Edit Config. Desktop cannot attach a header to localhost, so this starts a local proxy.

```json
{
  "mcpServers": {
    "spendable": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://127.0.0.1:3000/api/mcp", "--header", "Authorization:${SPENDABLE_TOKEN}"],
      "env": {
        "SPENDABLE_TOKEN": "Bearer PASTE"
      }
    }
  }
}
```
