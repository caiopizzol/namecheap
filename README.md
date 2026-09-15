# namecheap

[![GitHub release](https://img.shields.io/github/v/release/caiopizzol/namecheap)](https://github.com/caiopizzol/namecheap/releases)

Namecheap domain tools as an MCP server (local stdio or remote on Cloudflare Workers) and as a CLI. Check domain availability, search a keyword across TLDs, get pricing, and list supported TLDs.

## Tools

- **check_domains** — Check availability of one or more domain names
- **search_domains** — Search for a keyword across popular TLDs
- **get_pricing** — Get pricing for registration, renewal, or transfer by TLD
- **get_tld_list** — List all TLDs supported by Namecheap

## Credentials

Enable API access in your Namecheap profile and whitelist the public IP that will call the API. Namecheap validates the real source IP of every request, not only the `ClientIp` parameter, so the machine (or Worker egress) making the calls must be on the whitelist.

| Variable | Description |
|---|---|
| `NAMECHEAP_API_USER` | Your Namecheap API username |
| `NAMECHEAP_API_KEY` | Your Namecheap API key |
| `NAMECHEAP_USERNAME` | Namecheap username (defaults to API user) |
| `NAMECHEAP_CLIENT_IP` | Your whitelisted IP address |
| `NAMECHEAP_SANDBOX` | Set to `"true"` for the sandbox environment |

## Setup

```sh
bun install
cp .env.example .env  # fill in your Namecheap API credentials
bun run build         # emits dist/index.js (stdio MCP) and dist/cli.js (CLI)
bun run check         # lint, typecheck, tests
```

## CLI

```sh
namecheap check example.com mybrand.io
namecheap search mybrand --tlds com,io,dev
namecheap pricing io --action RENEW
namecheap tlds
namecheap search mybrand --json   # machine-readable output
```

Run it from a checkout with `bun src/cli.ts <command>` or `node --env-file=.env dist/cli.js <command>`. The CLI reads the same environment variables as the server, plus `--sandbox` to force the sandbox API. It exits 1 on API errors and 2 on usage errors.

After installing the package, `namecheap` runs the CLI and `namecheap-stdio` runs the MCP server.

## MCP over stdio

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

## Remote MCP on Cloudflare Workers

`src/worker.ts` serves the same tools over Streamable HTTP at `/mcp`. It accepts POST requests and returns 405 for GET/DELETE (no persistent SSE stream or sessions). It is stateless (one server per request) and fails closed: requests are refused until `MCP_AUTH_TOKEN` is set, including during local development.

```sh
cp .dev.vars.example .dev.vars   # local secrets for wrangler dev
bun run dev                      # http://localhost:8787/mcp
wrangler secret put NAMECHEAP_API_USER
wrangler secret put NAMECHEAP_API_KEY
wrangler secret put NAMECHEAP_CLIENT_IP
wrangler secret put MCP_AUTH_TOKEN
bun run deploy
```

Client configuration:

```json
{
  "mcpServers": {
    "namecheap": {
      "type": "http",
      "url": "https://namecheap.<your-subdomain>.workers.dev/mcp",
      "headers": { "Authorization": "Bearer <MCP_AUTH_TOKEN>" }
    }
  }
}
```

**Deployment prerequisite:** Namecheap requires whitelisted IPv4 egress. The ordinary Worker deployment above does not provide a dedicated outbound IPv4 address, and a working `/mcp` endpoint or `tools/list` response does not establish Namecheap connectivity. Do not whitelist broad Cloudflare ranges as a workaround.

A compatible static-IPv4 egress service must be selected and verified before relying on this deployment. Cloudflare documents an Enterprise [Dedicated CDN Egress IPs](https://developers.cloudflare.com/smart-shield/configuration/dedicated-egress-ips/other-products/#workers) option for Workers; suitability for this destination and account must be confirmed. No relay or managed-egress integration is included yet.

Before uploading secrets or deploying, verify the intended Cloudflare account with `wrangler whoami`. Use an account belonging to this project.

Domain checks (including custom search TLD lists) accept at most 50 domains per request. Split larger lists into separate calls. A provider error for any domain fails that check batch rather than reporting the domain as taken.
