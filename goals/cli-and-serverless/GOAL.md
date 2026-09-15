# CLI and serverless MCP

## Goal

Use the same Namecheap client from a CLI, local stdio MCP, and remote Cloudflare Worker.

## Status

- CLI and stdio MCP work. The CLI completed a live domain check.
- A fresh agent used the CLI correctly without a skill in one simulated search-and-pricing task.
- The local `namecheap` launcher is on PATH. It reads `NAMECHEAP_*` settings from the checkout's `.env`, then the shared agent environment file. Explicit process variables take precedence.
- The Worker passes local authentication and request tests. Live Namecheap access from the Worker is still unverified.
- The earlier work-account deployment was deleted. No replacement deployment or paid egress service has been created.

## Decisions

Keep Cloudflare Workers; don't switch to a Node host or NUC. Check costs before paying for egress. That investigation is paused while we improve the CLI, code, and docs.

Use the approved personal-account token from the existing kicktires environment file for future Cloudflare work. Never copy credentials into the repo. Verify GitHub writes against `git config github.account`.

Keep the four MCP tool names and CLI output shapes. Reject checks over 50 domains. A provider error fails the batch instead of reporting a domain as taken. Require a Worker bearer token in every environment; GET and DELETE return 405.

## Delivery

- [PR #1](https://github.com/caiopizzol/namecheap/pull/1): CLI and Worker interfaces — merged.
- [PR #2](https://github.com/caiopizzol/namecheap/pull/2): project rename — merged.
- [PR #3](https://github.com/caiopizzol/namecheap/pull/3): CI checks — merged; GitHub Check passed.
- [PR #4](https://github.com/caiopizzol/namecheap/pull/4): cleanup — merged as `1d8c6eb39ecdfca4e8a72db84c4f2a0ea979ab44`; Check and Cubic passed.

Cleanup verification: 37 tests, formatting, lint, types, clean build, Worker bundle, and live CLI check passed. Grok 4.6 reviewed the scope. It helped simplify command handling and separate formatter tests; we kept `dist/index.js` to avoid breaking existing MCP configs.

Cleanup delivery is complete. Local consultation records are in `/tmp/namecheap-consult/`; no background review monitor is active.

## Remote access still needs work

[Namecheap requires IPv4 whitelisting](https://www.namecheap.com/support/api/intro/). Mac probes returned the actual source IP in whitelist errors. They don't prove that the `ClientIp` parameter is never validated.

An earlier Worker request returned HTML HTTP 500. A separate IP-check service reported IPv6; that doesn't establish which address family the Namecheap connection used.

Cloudflare's Enterprise [Dedicated CDN Egress IPs](https://developers.cloudflare.com/smart-shield/configuration/dedicated-egress-ips/other-products/#workers) supports some Worker fetch configurations. Its fit for this destination and account, and its price, remain unverified. Don't whitelist broad Cloudflare ranges.

Cost research on 2026-09-15: [Fixie](https://usefixie.com/pricing) offers 500 requests free, then 2,500 for $5/month. [QuotaGuard Static](https://www.quotaguard.com/products/pricing) starts at $19/month for 20,000 requests. Their usual CONNECT proxy setup isn't a drop-in fit for Workers' fetch-backed HTTP client; neither has been selected.

## Next

Finish the documentation update and confirm PR delivery. When remote work resumes, verify a supported egress path and a successful real `check_domains` call before marking the remote MCP complete.
