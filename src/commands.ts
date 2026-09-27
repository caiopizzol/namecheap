import {
	formatDomainResults,
	formatPricing,
	formatSearchResults,
	formatTldList,
} from "./formatters.js";
import {
	MAX_DOMAINS_PER_CHECK,
	type NamecheapClient,
	normalizeTld,
	POPULAR_TLDS,
	splitList,
} from "./namecheap.js";

export class UsageError extends Error {}

export interface CommandOptions {
	tlds?: string;
	action?: string;
}

// A command validates its arguments before calling `connect`, so a usage error never reads configuration.
type Command = (
	args: string[],
	options: CommandOptions,
	connect: () => NamecheapClient,
) => Promise<{ data: unknown; text: string }>;

export const COMMANDS: Record<string, Command> = {
	async check(args, _options, connect) {
		const domains = args.flatMap(splitList);
		if (domains.length === 0)
			throw new UsageError("check: at least one domain is required");
		if (domains.length > MAX_DOMAINS_PER_CHECK)
			throw new UsageError(
				`At most ${MAX_DOMAINS_PER_CHECK} domains can be checked per request`,
			);
		const results = await connect().checkDomains(domains);
		return { data: results, text: formatDomainResults(results) };
	},
	async search(args, options, connect) {
		if (args.length !== 1)
			throw new UsageError("search: exactly one argument is required");
		const keyword = args[0];
		if (!keyword.trim() || keyword.includes(","))
			throw new UsageError("search: the keyword must be one non-empty name");
		const tlds =
			options.tlds === undefined
				? POPULAR_TLDS
				: splitList(options.tlds).map(normalizeTld);
		if (tlds.length === 0 || tlds.some((tld) => !tld))
			throw new UsageError("search: --tlds must contain TLDs");
		if (tlds.length > MAX_DOMAINS_PER_CHECK)
			throw new UsageError(
				`At most ${MAX_DOMAINS_PER_CHECK} domains can be checked per request`,
			);
		const results = await connect().searchDomains(keyword, tlds);
		return { data: results, text: formatSearchResults(keyword, results) };
	},
	async pricing(args, options, connect) {
		if (args.length !== 1)
			throw new UsageError("pricing: exactly one argument is required");
		const tld = normalizeTld(args[0]);
		if (!tld) throw new UsageError("pricing: a TLD is required");
		const action = (options.action ?? "REGISTER").toUpperCase();
		if (action !== "REGISTER" && action !== "RENEW" && action !== "TRANSFER")
			throw new UsageError(`pricing: unknown action "${options.action}"`);
		const prices = await connect().getPricing(tld, action);
		return {
			data: { tld, action, prices },
			text: formatPricing(tld, action, prices),
		};
	},
	async tlds(args, _options, connect) {
		if (args.length !== 0)
			throw new UsageError("tlds: no arguments are supported");
		const tlds = await connect().getTldList();
		return { data: tlds, text: formatTldList(tlds) };
	},
};
