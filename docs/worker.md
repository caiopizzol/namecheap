# Cloudflare Workers

The Worker serves MCP over Streamable HTTP at `/mcp`. It requires a bearer token, even locally. It accepts POST; GET and DELETE return 405 because there are no persistent sessions or SSE streams.

## Before you deploy

Namecheap checks the source IP and only allows IPv4 addresses on its whitelist. Ordinary Worker requests don't have a dedicated outbound IPv4 address. A working `/mcp` endpoint or tool list doesn't prove that Namecheap calls will work.

**Remote Namecheap access is still unverified.** This repo has no egress relay. Don't whitelist broad Cloudflare ranges. Cloudflare has an Enterprise [Dedicated CDN Egress IPs](https://developers.cloudflare.com/smart-shield/configuration/dedicated-egress-ips/other-products/#workers) option, but its fit and cost for this setup need checking.

## Run locally

```sh
cp .dev.vars.example .dev.vars
# Fill in the credentials and choose an MCP_AUTH_TOKEN.
bun run dev
```

The endpoint is `http://localhost:8787/mcp`. Send `Authorization: Bearer <MCP_AUTH_TOKEN>` with requests.

## Deploy

Once the egress requirement is sorted, check the account before uploading secrets:

```sh
bunx wrangler whoami
bunx wrangler secret put NAMECHEAP_API_USER
bunx wrangler secret put NAMECHEAP_API_KEY
bunx wrangler secret put NAMECHEAP_CLIENT_IP
bunx wrangler secret put MCP_AUTH_TOKEN
bun run deploy
```

`NAMECHEAP_USERNAME` and `NAMECHEAP_SANDBOX` are optional, as in the [CLI setup](../README.md#get-started).

Point your MCP client at the deployed URL:

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

Verify a successful `check_domains` call before relying on it.
