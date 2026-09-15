# Goal: CLI interface and serverless MCP

## Agreed outcome

Expose domain checks, keyword searches, pricing and TLD listing through a CLI and a serverless remote MCP, sharing one client and retaining stdio.

## Constraints and decisions

- User reaffirmed serverless on 2026-09-15. Evaluate costs before provisioning paid egress; do not substitute a NUC server.
- User authorized removal of the earlier deployment from the work account. Wrangler confirmed deletion on 2026-09-15.
- Use the CF_TOKEN from `/Users/cpolive/dev/personal/kicktires/.env` for the intended Cloudflare account. Verified account listing and Workers read access; never commit credentials.
- Conventional commits; GitHub writer from `git config github.account` is `caiopizzol`.
- Maintain existing four MCP tool contracts. Reject checks exceeding 50 domains rather than adding batching.

## Completion criteria and evidence

- [x] Shared client, formatters, tool registration, stdio, CLI and Worker entry points implemented.
- [x] CLI validates usage before credentials, uses exit 2 for usage and 1 for config/API errors; subprocess tests cover help, invalid input, successful mocked sandbox JSON and API failures.
- [x] Worker requires bearer token in every environment; request tests cover fail-closed behavior, invalid auth, initialization, tool listing, mocked success and upstream error results.
- [x] Domain limit and per-domain provider errors handled with focused tests. Neutral unexpected-response diagnostics.
- [x] Removed unsupported broad Cloudflare-range workaround from README; documented deployment prerequisite and account check.
- [x] Checks pass: 36 tests, lint, typecheck, Node build; Wrangler bundle dry-run passed before the final method-policy change.
- [ ] Commit/delivery recorded below.
- [ ] Select compatible static-IPv4 egress after cost review, obtain approved credentials and whitelist IPs.
- [ ] Deploy in intended account and verify successful real Namecheap requests through both CLI and remote MCP. Mocked responses do not satisfy this criterion.

## Networking evidence and cost research

Namecheap official API introduction requires IPv4 whitelisting. Prior Mac experiments reported error 1011150 with the actual source IP for both valid and bogus ClientIp parameters. This supports source validation, but does not show the parameter is never validated. Prior Worker probe failed with HTML HTTP 500; an IPv6 result from a separate IP-check service does not prove the Namecheap connection used IPv6.

Cloudflare Enterprise Dedicated CDN Egress supports Workers fetch in documented configurations; suitability for this third-party destination/account remains unverified. Ordinary Worker fetch has no configured dedicated egress here. A Cloudflare Tunnel does not confer a static public IPv4 on the NUC.

Pricing checked 2026-09-15:
- Fixie HTTP proxy: free 500 requests/100 MB; $5 monthly 2,500 requests/500 MB; $19 monthly 25,000 requests/10 GB. HTTPS uses CONNECT. Workers node:http is fetch-backed and its Agent is a stub, so standard Node proxy-agent snippets are not established Workers integrations.
- QuotaGuard Static: $19 monthly, 20,000 requests/10 GB, shared static IP pair. Investigating inbound fixed-target HTTPS proxy suitability before recommending.
- Cloudflare Dedicated CDN Egress: Enterprise, no verified public quote.

Sources:
- https://www.namecheap.com/support/api/intro/
- https://www.namecheap.com/support/api/methods/domains/check/
- https://developers.cloudflare.com/smart-shield/configuration/dedicated-egress-ips/other-products/#workers
- https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/
- https://usefixie.com/pricing
- https://usefixie.com/documentation/http-and-https-requests
- https://www.quotaguard.com/products/pricing

## Consultations and resume

Grok 4.6 xhigh existing session: `/tmp/namecheap-consult/grok/session-id`. Current review records `/tmp/namecheap-consult/fix-review.*`; consultation completed successfully. Accepted GET/DELETE 405 after verifying SDK stream lifecycle, explicit Node CLI subprocess runtime, and stdio startup error handling. Rejected restoring unavailable=false for domain provider errors: it would falsely report taken; fail-batch policy is documented. Earlier Grok endorsed stateless transport and flagged domain cap; later recommended NUC relay, which is not the accepted direction. Earlier Claude timed out after 20 minutes without an opinion.

Next: user question pending on Node serverless + Fixie free-tier proof versus keeping Workers. Low-cost CONNECT proxies are not drop-in Workers fetch integrations; do not implement a custom HTTP/TLS stack without evidence. No successful live Namecheap request yet. All code remains uncommitted at this checkpoint.
