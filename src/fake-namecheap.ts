import { appendFileSync } from "node:fs";

// Importing this module replaces `fetch` with an offline Namecheap XML API. Child processes load it
// with `node --import`, so it stays erasable TypeScript without local imports. Each request is
// appended to the file named by FAKE_NAMECHEAP_LOG, with the API key redacted, before it is answered.

export const FAKE_ENV = {
	NAMECHEAP_API_USER: "fake-user",
	NAMECHEAP_API_KEY: "fake-secret-api-key",
	NAMECHEAP_CLIENT_IP: "203.0.113.1",
};

export interface RecordedRequest {
	method: string;
	origin: string;
	path: string;
	query: Record<string, string>;
}

const ORIGINS = [
	"https://api.namecheap.com",
	"https://api.sandbox.namecheap.com",
];

// `.com` names are taken, names starting with `rare` are premium, and `.invalid` names fail upstream.
// Checking `outage.test` answers with an HTML 500 page instead of XML.
function domainResult(domain: string): string {
	if (domain.endsWith(".invalid"))
		return `<DomainCheckResult Domain="${domain}" Available="false" ErrorNo="3031510" Description="Provider failure" />`;
	const premium = domain.startsWith("rare");
	const price = premium ? "1500.00" : "0";
	return `<DomainCheckResult Domain="${domain}" Available="${!domain.endsWith(".com")}" ErrorNo="0" Description="" IsPremiumName="${premium}" PremiumRegistrationPrice="${price}" PremiumRenewalPrice="${price}" IcannFee="${premium ? "0.18" : "0"}" />`;
}

const COMMANDS: Record<string, (query: Record<string, string>) => string> = {
	"namecheap.domains.check": (query) =>
		query.DomainList.split(",").map(domainResult).join(""),
	"namecheap.users.getPricing": (query) =>
		`<UserGetPricingResult><ProductType Name="domains"><ProductCategory Name="${query.ActionName.toLowerCase()}"><Product Name="${query.ProductName}"><Price Duration="1" DurationType="YEAR" RegularPrice="13.98" YourPrice="10.28" Currency="USD" /><Price Duration="2" DurationType="YEAR" RegularPrice="13.98" YourPrice="13.98" Currency="USD" /></Product></ProductCategory></ProductType></UserGetPricingResult>`,
	"namecheap.domains.getTldList": () =>
		'<Tlds><Tld Name="com" IsApiRegisterable="true">Commercial</Tld><Tld Name="museum" IsApiRegisterable="false">Museums</Tld></Tlds>',
};

function respond(status: "OK" | "ERROR", body: string): Response {
	return new Response(
		`<?xml version="1.0" encoding="utf-8"?><ApiResponse Status="${status}" xmlns="http://api.namecheap.com/xml.response">${body}</ApiResponse>`,
	);
}

async function fakeFetch(
	input: string | URL | Request,
	init?: RequestInit,
): Promise<Response> {
	const log = process.env.FAKE_NAMECHEAP_LOG;
	if (!log) throw new Error("FAKE_NAMECHEAP_LOG is not set");
	const request = new Request(input, init);
	const url = new URL(request.url);
	const query = Object.fromEntries(url.searchParams);
	const authenticated =
		query.ApiUser === FAKE_ENV.NAMECHEAP_API_USER &&
		query.ApiKey === FAKE_ENV.NAMECHEAP_API_KEY;
	if (query.ApiKey !== undefined) query.ApiKey = "[redacted]";
	const recorded: RecordedRequest = {
		method: request.method,
		origin: url.origin,
		path: url.pathname,
		query,
	};
	appendFileSync(log, `${JSON.stringify(recorded)}\n`);
	if (!ORIGINS.includes(url.origin) || url.pathname !== "/xml.response")
		throw new Error(`Unexpected request to ${url.origin}${url.pathname}`);
	if (!authenticated)
		return respond(
			"ERROR",
			'<Errors><Error Number="1011102">API Key is invalid or API access has not been enabled</Error></Errors>',
		);
	if (query.DomainList === "outage.test")
		return new Response("<html>failure</html>", { status: 500 });
	if (!Object.hasOwn(COMMANDS, query.Command))
		throw new Error(`The fake does not model ${query.Command}`);
	return respond(
		"OK",
		`<CommandResponse Type="${query.Command}">${COMMANDS[query.Command](query)}</CommandResponse>`,
	);
}

globalThis.fetch = fakeFetch as typeof fetch;
