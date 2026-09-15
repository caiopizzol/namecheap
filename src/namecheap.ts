import { XMLParser } from "fast-xml-parser";

export interface NamecheapConfig {
	apiUser: string;
	apiKey: string;
	userName?: string;
	clientIp: string;
	sandbox?: boolean;
}

export type FetchLike = (
	url: string,
) => Promise<{ status: number; text(): Promise<string> }>;

export interface DomainCheckResult {
	domain: string;
	available: boolean;
	premium: boolean;
	premiumPrice?: number;
	premiumRenewalPrice?: number;
	icannFee?: number;
}

export interface PriceEntry {
	duration: number;
	durationType: string;
	price: number;
	regularPrice: number;
	currency: string;
}

export interface TldEntry {
	name: string;
	apiRegisterable: boolean;
}

export type PricingAction = "REGISTER" | "RENEW" | "TRANSFER";

export const POPULAR_TLDS = [
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

export class NamecheapError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NamecheapError";
	}
}

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
});

// biome-ignore lint/suspicious/noExplicitAny: parsed XML has no static shape
type Xml = any;

function asArray<T>(value: T | T[] | undefined): T[] {
	if (value === undefined || value === null) return [];
	return Array.isArray(value) ? value : [value];
}

export function readConfigFromEnv(env: {
	[key: string]: string | undefined;
}): NamecheapConfig {
	const apiUser = env.NAMECHEAP_API_USER ?? "";
	const apiKey = env.NAMECHEAP_API_KEY ?? "";
	const clientIp = env.NAMECHEAP_CLIENT_IP ?? "";
	const missing = [
		["NAMECHEAP_API_USER", apiUser],
		["NAMECHEAP_API_KEY", apiKey],
		["NAMECHEAP_CLIENT_IP", clientIp],
	]
		.filter(([, v]) => !v)
		.map(([k]) => k);
	if (missing.length > 0) {
		throw new NamecheapError(
			`Missing required environment variables: ${missing.join(", ")}`,
		);
	}
	return {
		apiUser,
		apiKey,
		userName: env.NAMECHEAP_USERNAME || undefined,
		clientIp,
		sandbox: env.NAMECHEAP_SANDBOX === "true",
	};
}

export function parseApiResponse(xml: string, status = 200): Xml {
	const parsed = parser.parse(xml);
	const apiResponse = parsed?.ApiResponse;
	if (!apiResponse) {
		throw new NamecheapError(
			`Unexpected non-XML response from Namecheap API (HTTP ${status}).`,
		);
	}
	if (apiResponse["@_Status"] === "ERROR") {
		const errors = asArray<Xml>(apiResponse.Errors?.Error);
		const msg =
			errors.map((e) => e?.["#text"] ?? e).join("; ") || "Unknown API error";
		throw new NamecheapError(`Namecheap API error: ${msg}`);
	}
	return apiResponse.CommandResponse;
}

export function parseDomainCheckResults(response: Xml): DomainCheckResult[] {
	return asArray<Xml>(response?.DomainCheckResult).map((r) => {
		if (r["@_ErrorNo"] && r["@_ErrorNo"] !== "0") {
			throw new NamecheapError(
				`Domain check failed for ${r["@_Domain"]}: ${r["@_Description"] || r["@_ErrorNo"]}`,
			);
		}
		const result: DomainCheckResult = {
			domain: r["@_Domain"],
			available: r["@_Available"] === "true",
			premium: r["@_IsPremiumName"] === "true",
		};
		if (result.premium) {
			result.premiumPrice =
				Number.parseFloat(r["@_PremiumRegistrationPrice"]) || undefined;
			result.premiumRenewalPrice =
				Number.parseFloat(r["@_PremiumRenewalPrice"]) || undefined;
		}
		const icann = Number.parseFloat(r["@_IcannFee"]);
		if (icann > 0) result.icannFee = icann;
		return result;
	});
}

export function parsePricing(response: Xml): PriceEntry[] {
	const product =
		response?.UserGetPricingResult?.ProductType?.ProductCategory?.Product;
	return asArray<Xml>(product?.Price).map((p) => ({
		duration: Number.parseInt(p["@_Duration"], 10),
		durationType: p["@_DurationType"],
		price: Number.parseFloat(p["@_YourPrice"]),
		regularPrice: Number.parseFloat(p["@_RegularPrice"]),
		currency: p["@_Currency"],
	}));
}

export function parseTldList(response: Xml): TldEntry[] {
	return asArray<Xml>(response?.Tlds?.Tld).map((t) => ({
		name: t["@_Name"],
		apiRegisterable: t["@_IsApiRegisterable"] === "true",
	}));
}

export function normalizeTld(tld: string): string {
	return tld.trim().replace(/^\./, "").toLowerCase();
}

export function splitList(value: string): string[] {
	return value
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

export class NamecheapClient {
	private readonly baseUrl: string;

	constructor(
		private readonly config: NamecheapConfig,
		private readonly fetchImpl: FetchLike = (url) => fetch(url),
	) {
		this.baseUrl = config.sandbox
			? "https://api.sandbox.namecheap.com/xml.response"
			: "https://api.namecheap.com/xml.response";
	}

	async call(
		command: string,
		params: Record<string, string> = {},
	): Promise<Xml> {
		const url = new URL(this.baseUrl);
		url.searchParams.set("ApiUser", this.config.apiUser);
		url.searchParams.set("ApiKey", this.config.apiKey);
		url.searchParams.set(
			"UserName",
			this.config.userName ?? this.config.apiUser,
		);
		url.searchParams.set("ClientIp", this.config.clientIp);
		url.searchParams.set("Command", command);
		for (const [k, v] of Object.entries(params)) {
			url.searchParams.set(k, v);
		}
		const res = await this.fetchImpl(url.toString());
		return parseApiResponse(await res.text(), res.status);
	}

	async checkDomains(domains: string[]): Promise<DomainCheckResult[]> {
		if (domains.length > 50) {
			throw new NamecheapError("At most 50 domains can be checked per request");
		}
		if (domains.length === 0) {
			throw new NamecheapError("No domains provided");
		}
		const response = await this.call("namecheap.domains.check", {
			DomainList: domains.join(","),
		});
		return parseDomainCheckResults(response);
	}

	async searchDomains(
		keyword: string,
		tlds: string[] = POPULAR_TLDS,
	): Promise<DomainCheckResult[]> {
		const domains = tlds.map((tld) => `${keyword}.${normalizeTld(tld)}`);
		return this.checkDomains(domains);
	}

	async getPricing(
		tld: string,
		action: PricingAction = "REGISTER",
	): Promise<PriceEntry[]> {
		const response = await this.call("namecheap.users.getPricing", {
			ProductType: "DOMAIN",
			ProductCategory: "DOMAINS",
			ActionName: action,
			ProductName: normalizeTld(tld),
		});
		return parsePricing(response);
	}

	async getTldList(): Promise<TldEntry[]> {
		const response = await this.call("namecheap.domains.getTldList");
		return parseTldList(response);
	}
}
