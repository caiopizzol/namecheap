# namecheap-mcp

[![GitHub release](https://img.shields.io/github/v/release/caiopizzol/namecheap-mcp)](https://github.com/caiopizzol/namecheap-mcp/releases)

MCP server for the Namecheap API. Check domain availability, search across TLDs, get pricing, and list supported TLDs.

## Tools

- **check_domains** — Check availability of one or more domain names
- **search_domains** — Search for a keyword across popular TLDs
- **get_pricing** — Get pricing for registration, renewal, or transfer by TLD
- **get_tld_list** — List all TLDs supported by Namecheap

## Setup

```sh
bun install
cp .env.example .env  # fill in your Namecheap API credentials
bun run build
```

### Environment variables

| Variable | Description |
|---|---|
| `NAMECHEAP_API_USER` | Your Namecheap API username |
| `NAMECHEAP_API_KEY` | Your Namecheap API key |
| `NAMECHEAP_USERNAME` | Namecheap username (defaults to API user) |
| `NAMECHEAP_CLIENT_IP` | Your whitelisted IP address |
| `NAMECHEAP_SANDBOX` | Set to `"true"` for sandbox environment |

## Usage

```json
{
  "mcpServers": {
    "namecheap": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {
        "NAMECHEAP_API_USER": "your_username",
        "NAMECHEAP_API_KEY": "your_api_key",
        "NAMECHEAP_CLIENT_IP": "your_ip"
      }
    }
  }
}
```
