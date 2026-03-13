#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { XMLParser } from "fast-xml-parser";
import { z } from "zod";

// --- Config ---

const API_USER = process.env.NAMECHEAP_API_USER ?? "";
const API_KEY = process.env.NAMECHEAP_API_KEY ?? "";
const USERNAME = process.env.NAMECHEAP_USERNAME ?? API_USER;
const CLIENT_IP = process.env.NAMECHEAP_CLIENT_IP ?? "";
const SANDBOX = process.env.NAMECHEAP_SANDBOX === "true";

const BASE_URL = SANDBOX
	? "https://api.sandbox.namecheap.com/xml.response"
	: "https://api.namecheap.com/xml.response";

const POPULAR_TLDS = [
	"com",
	"net",
	"org",
	"io",
	"co",
	"dev",
	"app",
	"ai",
	"xyz",
	"me",
	"info",
	"biz",
	"tech",
	"online",
	"store",
];

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
});

// --- Namecheap API helpers ---

async function callApi(
	command: string,
	params: Record<string, string> = {},
): Promise<any> {
	const url = new URL(BASE_URL);
	url.searchParams.set("ApiUser", API_USER);
	url.searchParams.set("ApiKey", API_KEY);
	url.searchParams.set("UserName", USERNAME);
	url.searchParams.set("ClientIp", CLIENT_IP);
	url.searchParams.set("Command", command);
	for (const [k, v] of Object.entries(params)) {
		url.searchParams.set(k, v);
	}

	const res = await fetch(url.toString());
	const xml = await res.text();
	const parsed = parser.parse(xml);

	const apiResponse = parsed.ApiResponse;
	if (apiResponse["@_Status"] === "ERROR") {
		const errors = apiResponse.Errors?.Error;
		const msg = Array.isArray(errors)
			? errors.map((e: any) => e["#text"] ?? e).join("; ")
			: (errors?.["#text"] ?? errors ?? "Unknown API error");
		throw new Error(`Namecheap API error: ${msg}`);
	}

	return apiResponse.CommandResponse;
}

// --- Result formatting ---

interface DomainCheckResult {
	domain: string;
	available: boolean;
	premium: boolean;
	premiumPrice?: number;
	premiumRenewalPrice?: number;
	icannFee?: number;
}

function parseDomainCheckResults(response: any): DomainCheckResult[] {
	const results = response.DomainCheckResult;
	const items = Array.isArray(results) ? results : [results];

	return items.map((r: any) => {
		const result: DomainCheckResult = {
			domain: r["@_Domain"],
			available: r["@_Available"] === "true",
			premium: r["@_IsPremiumName"] === "true",
		};
		if (result.premium) {
			result.premiumPrice =
				parseFloat(r["@_PremiumRegistrationPrice"]) || undefined;
			result.premiumRenewalPrice =
				parseFloat(r["@_PremiumRenewalPrice"]) || undefined;
		}
		const icann = parseFloat(r["@_IcannFee"]);
		if (icann > 0) result.icannFee = icann;
		return result;
	});
}

function formatDomainResults(results: DomainCheckResult[]): string {
	const lines = results.map((r) => {
		const status = r.available ? "✅ Available" : "❌ Taken";
		let line = `${r.domain} — ${status}`;
		if (r.premium && r.premiumPrice) {
			line += ` (Premium: $${r.premiumPrice}/yr)`;
		}
		return line;
	});
	return lines.join("\n");
}

// --- MCP Server ---

const server = new McpServer({
	name: "namecheap",
	version: "1.0.0",
});

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
		const response = await callApi("namecheap.domains.check", {
			DomainList: domains,
		});
		const results = parseDomainCheckResults(response);
		return { content: [{ type: "text", text: formatDomainResults(results) }] };
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
				"Comma-separated TLDs to check (default: com,net,org,io,co,dev,app,ai,xyz,me,info,biz,tech,online,store)",
			),
	},
	async ({ keyword, tlds }) => {
		const tldList = tlds
			? tlds.split(",").map((t) => t.trim().replace(/^\./, ""))
			: POPULAR_TLDS;
		const domainList = tldList.map((tld) => `${keyword}.${tld}`).join(",");

		const response = await callApi("namecheap.domains.check", {
			DomainList: domainList,
		});
		const results = parseDomainCheckResults(response);

		const available = results.filter((r) => r.available);
		const taken = results.filter((r) => !r.available);

		let text = `Domain search for "${keyword}":\n\n`;
		if (available.length > 0) {
			text += `Available (${available.length}):\n${formatDomainResults(available)}\n\n`;
		}
		if (taken.length > 0) {
			text += `Taken (${taken.length}):\n${formatDomainResults(taken)}`;
		}
		if (available.length === 0) {
			text += "\nNo available domains found across the checked TLDs.";
		}

		return { content: [{ type: "text", text }] };
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
		const response = await callApi("namecheap.users.getPricing", {
			ProductType: "DOMAIN",
			ProductCategory: "DOMAINS",
			ActionName: action ?? "REGISTER",
			ProductName: tld.replace(/^\./, ""),
		});

		const productType = response.UserGetPricingResult?.ProductType;
		const category = productType?.ProductCategory;
		const product = category?.Product;

		if (!product) {
			return {
				content: [{ type: "text", text: `No pricing found for .${tld}` }],
			};
		}

		const prices = Array.isArray(product.Price)
			? product.Price
			: [product.Price];
		const lines = prices.map((p: any) => {
			const duration = p["@_Duration"];
			const durationType = p["@_DurationType"];
			const yourPrice = p["@_YourPrice"];
			const regularPrice = p["@_RegularPrice"];
			const currency = p["@_Currency"];
			let line = `.${tld} — ${duration} ${durationType}: $${yourPrice} ${currency}`;
			if (yourPrice !== regularPrice) {
				line += ` (regular: $${regularPrice})`;
			}
			return line;
		});

		const actionLabel = action ?? "REGISTER";
		return {
			content: [
				{
					type: "text",
					text: `${actionLabel} pricing for .${tld}:\n\n${lines.join("\n")}`,
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
		const response = await callApi("namecheap.domains.getTldList");
		const tlds = response.Tlds?.Tld;

		if (!tlds) {
			return {
				content: [{ type: "text", text: "Could not retrieve TLD list." }],
			};
		}

		const items = Array.isArray(tlds) ? tlds : [tlds];
		const lines = items.map((t: any) => {
			const name = t["@_Name"];
			const isApi = t["@_IsApiRegisterable"] === "true";
			return `.${name}${isApi ? "" : " (not available via API)"}`;
		});

		return {
			content: [
				{
					type: "text",
					text: `Supported TLDs (${lines.length}):\n\n${lines.join("\n")}`,
				},
			],
		};
	},
);

// --- Start ---

async function main() {
	if (!API_KEY || !API_USER || !CLIENT_IP) {
		console.error(
			"Missing required env vars: NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_CLIENT_IP",
		);
		process.exit(1);
	}

	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main();
