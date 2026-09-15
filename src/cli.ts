#!/usr/bin/env node

import { parseArgs } from "node:util";
import {
	formatDomainResults,
	formatPricing,
	formatSearchResults,
	formatTldList,
} from "./formatters.js";
import {
	MAX_DOMAINS_PER_CHECK,
	NamecheapClient,
	normalizeTld,
	POPULAR_TLDS,
	readConfigFromEnv,
	splitList,
} from "./namecheap.js";

const USAGE = `Usage: namecheap <command> [options]

Commands:
  check <domain...>          Check availability of full domain names
  search <keyword>           Check a keyword across TLDs (--tlds com,io,dev)
  pricing <tld>              Get pricing for a TLD (--action REGISTER|RENEW|TRANSFER)
  tlds                       List TLDs supported by Namecheap

Options:
  --json                     Print JSON instead of text
  --tlds <list>              Comma-separated TLDs for search (default: ${POPULAR_TLDS.join(",")})
  --action <name>            Pricing action (default: REGISTER)
  --sandbox                  Use the Namecheap sandbox API
  -h, --help                 Show this help

Environment:
  NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_CLIENT_IP (required)
  NAMECHEAP_USERNAME, NAMECHEAP_SANDBOX (optional)`;

function fail(message: string, code = 1): never {
	console.error(message);
	process.exit(code);
}

class UsageError extends Error {}

function createClient(sandbox: boolean | undefined): NamecheapClient {
	const config = readConfigFromEnv(process.env);
	if (sandbox) config.sandbox = true;
	return new NamecheapClient(config);
}

async function main(argv: string[]) {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			json: { type: "boolean", default: false },
			tlds: { type: "string" },
			action: { type: "string" },
			sandbox: { type: "boolean", default: false },
			help: { type: "boolean", short: "h", default: false },
		},
	});

	const [command, ...rest] = positionals;
	if (values.help || !command) {
		console.log(USAGE);
		process.exit(values.help ? 0 : 2);
	}

	if (!["check", "search", "pricing", "tlds"].includes(command))
		throw new UsageError(`Unknown command "${command}"`);
	if (values.tlds !== undefined && command !== "search")
		throw new UsageError("--tlds is only supported by search");
	if (values.action !== undefined && command !== "pricing")
		throw new UsageError("--action is only supported by pricing");
	const print = (data: unknown, text: () => string) => {
		console.log(values.json ? JSON.stringify(data, null, 2) : text());
	};

	switch (command) {
		case "check": {
			const domains = rest.flatMap(splitList);
			if (domains.length === 0)
				throw new UsageError("check: at least one domain is required");
			if (domains.length > MAX_DOMAINS_PER_CHECK)
				throw new UsageError(
					`At most ${MAX_DOMAINS_PER_CHECK} domains can be checked per request`,
				);
			const results = await createClient(values.sandbox).checkDomains(domains);
			print(results, () => formatDomainResults(results));
			return;
		}
		case "search": {
			if (rest.length !== 1)
				throw new UsageError("search: exactly one argument is required");
			const keyword = rest[0];
			const tlds =
				values.tlds === undefined
					? POPULAR_TLDS
					: splitList(values.tlds).map(normalizeTld);
			if (tlds.length === 0 || tlds.some((tld) => !tld))
				throw new UsageError("search: --tlds must contain TLDs");
			if (tlds.length > MAX_DOMAINS_PER_CHECK)
				throw new UsageError(
					`At most ${MAX_DOMAINS_PER_CHECK} domains can be checked per request`,
				);
			const results = await createClient(values.sandbox).searchDomains(
				keyword,
				tlds,
			);
			print(results, () => formatSearchResults(keyword, results));
			return;
		}
		case "pricing": {
			if (rest.length !== 1)
				throw new UsageError("pricing: exactly one argument is required");
			const tld = normalizeTld(rest[0]);
			if (!tld) throw new UsageError("pricing: a TLD is required");
			const action = (values.action ?? "REGISTER").toUpperCase();
			if (action !== "REGISTER" && action !== "RENEW" && action !== "TRANSFER")
				throw new UsageError(`pricing: unknown action "${values.action}"`);
			const prices = await createClient(values.sandbox).getPricing(tld, action);
			print({ tld, action, prices }, () => formatPricing(tld, action, prices));
			return;
		}
		case "tlds": {
			if (rest.length !== 0)
				throw new UsageError("tlds: no arguments are supported");
			const tlds = await createClient(values.sandbox).getTldList();
			print(tlds, () => formatTldList(tlds));
			return;
		}
	}
}

main(process.argv.slice(2)).catch((err) => {
	const message = err instanceof Error ? err.message : String(err);
	fail(
		message,
		err instanceof UsageError || String(err?.code).startsWith("ERR_PARSE_ARGS_")
			? 2
			: 1,
	);
});
