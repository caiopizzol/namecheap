import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
	formatDomainResults,
	formatPricing,
	formatSearchResults,
	formatTldList,
} from "./formatters.js";
import {
	type NamecheapClient,
	normalizeTld,
	POPULAR_TLDS,
	splitList,
} from "./namecheap.js";

export const SERVER_INFO = { name: "namecheap", version: "1.0.0" };

export function registerTools(server: McpServer, client: NamecheapClient) {
	server.tool(
		"check_domains",
		"Check availability of one or more domain names (e.g. 'example.com,test.io')",
		{
			domains: z
				.string()
				.describe(
					"Comma-separated list of full domain names to check (e.g. 'mybrand.com,mybrand.io')",
				),
		},
		async ({ domains }) => {
			const results = await client.checkDomains(splitList(domains));
			return {
				content: [{ type: "text", text: formatDomainResults(results) }],
			};
		},
	);

	server.tool(
		"search_domains",
		"Search for a keyword across popular TLDs to find available domain names",
		{
			keyword: z
				.string()
				.describe("The keyword or brand name to search (without TLD)"),
			tlds: z
				.string()
				.optional()
				.describe(
					`Comma-separated TLDs to check (default: ${POPULAR_TLDS.join(",")})`,
				),
		},
		async ({ keyword, tlds }) => {
			const tldList = tlds ? splitList(tlds).map(normalizeTld) : POPULAR_TLDS;
			const results = await client.searchDomains(keyword, tldList);
			return {
				content: [
					{ type: "text", text: formatSearchResults(keyword, results) },
				],
			};
		},
	);

	server.tool(
		"get_pricing",
		"Get Namecheap pricing for domain registration, renewal, or transfer by TLD",
		{
			tld: z
				.string()
				.describe("The TLD to get pricing for (e.g. 'com', 'io', 'dev')"),
			action: z
				.enum(["REGISTER", "RENEW", "TRANSFER"])
				.optional()
				.describe("Price action type (default: REGISTER)"),
		},
		async ({ tld, action }) => {
			const name = normalizeTld(tld);
			const prices = await client.getPricing(name, action ?? "REGISTER");
			return {
				content: [
					{
						type: "text",
						text: formatPricing(name, action ?? "REGISTER", prices),
					},
				],
			};
		},
	);

	server.tool(
		"get_tld_list",
		"Get the list of all TLDs supported by Namecheap",
		{},
		async () => {
			const tlds = await client.getTldList();
			return { content: [{ type: "text", text: formatTldList(tlds) }] };
		},
	);
}
