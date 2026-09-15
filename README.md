<p align="center">
  <img src="docs/assets/icon.svg" width="80" height="80" alt="Namecheap domain tools">
</p>

<h1 align="center">Namecheap</h1>

<p align="center">
  Find a domain, check prices, and use the same tools from your terminal or AI agent.
</p>

<p align="center">
  <a href="https://github.com/caiopizzol/namecheap/releases"><img src="https://img.shields.io/github/v/release/caiopizzol/namecheap" alt="Release"></a>
  <a href="https://github.com/caiopizzol/namecheap/actions/workflows/check.yml"><img src="https://github.com/caiopizzol/namecheap/actions/workflows/check.yml/badge.svg" alt="Checks"></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&amp;logoColor=white" alt="TypeScript"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/Bun-000000?logo=bun&amp;logoColor=white" alt="Bun"></a>
</p>

## Get started

You'll need [Bun](https://bun.sh), Node.js 22+, and [Namecheap API access](https://www.namecheap.com/support/api/intro/). Add your machine's public IPv4 address to Namecheap's whitelist. If it changes, update the whitelist and `NAMECHEAP_CLIENT_IP`.

```sh
bun install
cp .env.example .env
# Fill in .env, then build:
bun run build
node --env-file=.env dist/cli.js check example.com --json
```

| Variable | What to put here |
|---|---|
| `NAMECHEAP_API_USER` | Your API username |
| `NAMECHEAP_API_KEY` | Your API key |
| `NAMECHEAP_CLIENT_IP` | Your whitelisted IPv4 address |
| `NAMECHEAP_USERNAME` | Optional; defaults to your API username |
| `NAMECHEAP_SANDBOX` | Optional; `true` uses Namecheap's test API |

## Use the CLI

From the checkout, run `bun src/cli.ts`:

```sh
bun src/cli.ts check example.com mybrand.io
bun src/cli.ts search mybrand --tlds com,io,dev --json
bun src/cli.ts pricing io --action RENEW
bun src/cli.ts tlds
```

Use `--json` for scripts and agents, `--sandbox` for the test API, and `--help` for all options. Pricing accepts `REGISTER` (default), `RENEW`, or `TRANSFER`. The CLI exits with `1` for API/config errors and `2` for invalid arguments.

If you've installed the commands, use `namecheap` for the CLI and `namecheap-stdio` for MCP. Regular commands read environment variables; the checkout examples above let Bun load `.env`.

Checks accept up to **50 domains** at a time, including custom search lists. Split longer lists into separate calls. If the API reports an error for a domain, the whole call fails; it won't label that domain as taken.

## Connect an AI agent

Add this to your MCP client config, replacing the path and credentials:

```json
{
  "mcpServers": {
    "namecheap": {
      "command": "node",
      "args": ["/absolute/path/to/namecheap/dist/index.js"],
      "env": {
        "NAMECHEAP_API_USER": "your_username",
        "NAMECHEAP_API_KEY": "your_api_key",
        "NAMECHEAP_CLIENT_IP": "your_ip"
      }
    }
  }
}
```

The four tools are `check_domains`, `search_domains`, `get_pricing`, and `get_tld_list`.

Want remote MCP? See [Cloudflare Workers setup](docs/worker.md). The HTTP handler works, but Namecheap access still needs compatible whitelisted IPv4 egress.

## Work on the code

```sh
bun run check   # formatting, lint, types, and tests
bun run build   # refresh the compiled CLI and stdio server
```

Tests live next to the source. `cli.ts` and `index.ts` start the CLI and stdio MCP; `worker.ts` handles HTTP. `namecheap.ts` talks to the API, `mcp-tools.ts` registers tools, and `formatters.ts` builds text output.
