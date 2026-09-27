#!/usr/bin/env node

import { parseArgs } from "node:util";
import { COMMANDS, UsageError } from "./commands.js";
import {
	NamecheapClient,
	POPULAR_TLDS,
	readConfigFromEnv,
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

	if (!Object.hasOwn(COMMANDS, command))
		throw new UsageError(`Unknown command "${command}"`);
	if (values.tlds !== undefined && command !== "search")
		throw new UsageError("--tlds is only supported by search");
	if (values.action !== undefined && command !== "pricing")
		throw new UsageError("--action is only supported by pricing");
	const { data, text } = await COMMANDS[command](rest, values, () =>
		createClient(values.sandbox),
	);
	console.log(values.json ? JSON.stringify(data, null, 2) : text);
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
