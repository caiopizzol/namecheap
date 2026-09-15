#!/usr/bin/env node

import { parseArgs } from "node:util";
import {
	formatDomainResults,
	formatPricing,
	formatSearchResults,
	formatTldList,
} from "./format.js";
import {
	NamecheapClient,
	normalizeTld,
	POPULAR_TLDS,
	type PricingAction,
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
	if (command === "check" && rest.flatMap(splitList).length === 0)
		throw new UsageError("check: at least one domain is required");
	if ((command === "search" || command === "pricing") && rest.length !== 1)
		throw new UsageError(`${command}: exactly one argument is required`);
	if (command === "tlds" && rest.length !== 0)
		throw new UsageError("tlds: no arguments are supported");
	if (command === "pricing" && !normalizeTld(rest[0]))
		throw new UsageError("pricing: a TLD is required");
	if (
		values.action !== undefined &&
		!["REGISTER", "RENEW", "TRANSFER"].includes(values.action.toUpperCase())
	)
		throw new UsageError(`pricing: unknown action "${values.action}"`);
	if (
		values.tlds !== undefined &&
		(splitList(values.tlds).length === 0 ||
			splitList(values.tlds).some((tld) => !normalizeTld(tld)))
	)
		throw new UsageError("search: --tlds must contain TLDs");
	if (
		(command === "check" && rest.flatMap(splitList).length > 50) ||
		(command === "search" &&
			values.tlds !== undefined &&
			splitList(values.tlds).length > 50)
	)
		throw new UsageError("At most 50 domains can be checked per request");

	const config = readConfigFromEnv(process.env);
	if (values.sandbox) config.sandbox = true;
	const client = new NamecheapClient(config);

	const print = (data: unknown, text: () => string) => {
		console.log(values.json ? JSON.stringify(data, null, 2) : text());
	};

	switch (command) {
		case "check": {
			const domains = rest.flatMap(splitList);
			const results = await client.checkDomains(domains);
			print(results, () => formatDomainResults(results));
			return;
		}
		case "search": {
			const keyword = rest[0];
			const tlds = values.tlds
				? splitList(values.tlds).map(normalizeTld)
				: POPULAR_TLDS;
			const results = await client.searchDomains(keyword, tlds);
			print(results, () => formatSearchResults(keyword, results));
			return;
		}
		case "pricing": {
			const tld = rest[0] ? normalizeTld(rest[0]) : "";
			const action = (values.action ?? "REGISTER").toUpperCase();
			const prices = await client.getPricing(tld, action as PricingAction);
			print({ tld, action, prices }, () => formatPricing(tld, action, prices));
			return;
		}
		case "tlds": {
			const tlds = await client.getTldList();
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
