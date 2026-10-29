<p align="center">
  <img src="docs/logo.svg" alt="spendable" width="320">
</p>

<p align="center">
  <a href="https://github.com/cayubweeums/spendable/releases"><img src="https://img.shields.io/github/v/release/cayubweeums/spendable?style=flat-square&color=1c3d34" alt="release"></a>
  <a href="https://github.com/cayubweeums/spendable/actions/workflows/main.yml"><img src="https://img.shields.io/github/actions/workflow/status/cayubweeums/spendable/main.yml?style=flat-square&label=build" alt="build"></a>
  <a href="https://github.com/cayubweeums/spendable/pkgs/container/spendable"><img src="https://img.shields.io/badge/ghcr.io-spendable-1c3d34?style=flat-square" alt="image"></a>
</p>

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

Open http://127.0.0.1:3000, set a name and password, and sign in with those.

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
