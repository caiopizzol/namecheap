import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bin } from "../package.json";
import { COMMANDS } from "./commands.js";
import { FAKE_ENV, type RecordedRequest } from "./fake-namecheap.js";
import worker, { type Env, ROUTES } from "./worker.js";

// Every public surface runs offline against the fake Namecheap API: the built CLI and stdio server
// as child processes, and the Worker in process. Each case pins the exact output and the exact
// requests sent upstream. Children get a temporary HOME and the case's variables, never the real
// environment, so real credentials in `.env` or HOME are never read.
// The last test fails when a declared command, tool, or route has no case here.

const ROOT = join(import.meta.dirname, "..");
const FAKE = join(ROOT, "src/fake-namecheap.ts");
const dir = mkdtempSync(join(tmpdir(), "namecheap-surfaces-"));
const WORKER_LOG = join(dir, "worker.jsonl");
process.env.FAKE_NAMECHEAP_LOG = WORKER_LOG;
beforeAll(() => execFileSync("bun", ["run", "build"], { cwd: ROOT }));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// Every credential used here contains "secret", and no output or recorded request may contain it.
const SECRET = /secret/;
const TOKEN = "secret-token";
const WORKER_ENV: Env = { ...FAKE_ENV, MCP_AUTH_TOKEN: TOKEN };

function drain(log: string): RecordedRequest[] {
	if (!existsSync(log)) return [];
	const lines = readFileSync(log, "utf8").split("\n").filter(Boolean);
	rmSync(log);
	return lines.map((line) => JSON.parse(line));
}

function expectExact(actual: object, expected: object) {
	expect(JSON.stringify(actual)).not.toMatch(SECRET);
	expect(actual).toEqual(expected);
}

let runs = 0;
function run(script: string, args: string[], env = {}, input = "") {
	const log = join(dir, `${runs++}.jsonl`);
	const result = spawnSync(
		process.execPath,
		["--import", FAKE, script, ...args],
		{
			cwd: ROOT,
			encoding: "utf8",
			input,
			env: { HOME: dir, FAKE_NAMECHEAP_LOG: log, ...env },
		},
	);
	return {
		code: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
		requests: drain(log),
	};
}

const api = (
	Command: string,
	params: Record<string, string> = {},
	origin = "https://api.namecheap.com",
) => ({
	method: "GET",
	origin,
	path: "/xml.response",
	query: {
		ApiUser: "fake-user",
		ApiKey: "[redacted]",
		UserName: "fake-user",
		ClientIp: "203.0.113.1",
		Command,
		...params,
	},
});
const check = (DomainList: string) =>
	api("namecheap.domains.check", { DomainList });
const pricing = (ProductName: string, ActionName: string) =>
	api("namecheap.users.getPricing", {
		ProductType: "DOMAIN",
		ProductCategory: "DOMAINS",
		ActionName,
		ProductName,
	});
const tldList = (params = {}, origin?: string) =>
	api("namecheap.domains.getTldList", params, origin);
const SANDBOX = "https://api.sandbox.namecheap.com";

const DEFAULT_TLDS =
	"com,net,org,io,co,dev,app,ai,xyz,me,info,biz,tech,online,store";
const DEFAULT_SEARCH = check(
	DEFAULT_TLDS.split(",")
		.map((tld) => `brand.${tld}`)
		.join(","),
);
const CHECK_TEXT =
	"example.com — ❌ Taken\nrarebrand.io — ✅ Available (Premium: $1500/yr)";
const SEARCH_TEXT = `Domain search for "brand":

Available (14):
brand.net — ✅ Available
brand.org — ✅ Available
brand.io — ✅ Available
brand.co — ✅ Available
brand.dev — ✅ Available
brand.app — ✅ Available
brand.ai — ✅ Available
brand.xyz — ✅ Available
brand.me — ✅ Available
brand.info — ✅ Available
brand.biz — ✅ Available
brand.tech — ✅ Available
brand.online — ✅ Available
brand.store — ✅ Available

Taken (1):
brand.com — ❌ Taken`;
const pricingText = (tld: string, action: string) =>
	`${action} pricing for .${tld}:\n\n.${tld} — 1 YEAR: $10.28 USD (regular: $13.98)\n.${tld} — 2 YEAR: $13.98 USD`;
const TLDS_TEXT =
	"Supported TLDs (2):\n\n.com\n.museum (not available via API)";
const PRICES = [
	{
		duration: 1,
		durationType: "YEAR",
		price: 10.28,
		regularPrice: 13.98,
		currency: "USD",
	},
	{
		duration: 2,
		durationType: "YEAR",
		price: 13.98,
		regularPrice: 13.98,
		currency: "USD",
	},
];

const USAGE = `Usage: namecheap <command> [options]

Commands:
  check <domain...>          Check availability of full domain names
  search <keyword>           Check a keyword across TLDs (--tlds com,io,dev)
  pricing <tld>              Get pricing for a TLD (--action REGISTER|RENEW|TRANSFER)
  tlds                       List TLDs supported by Namecheap

Options:
  --json                     Print JSON instead of text
  --tlds <list>              Comma-separated TLDs for search (default: ${DEFAULT_TLDS})
  --action <name>            Pricing action (default: REGISTER)
  --sandbox                  Use the Namecheap sandbox API
  -h, --help                 Show this help

Environment:
  NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_CLIENT_IP (required)
  NAMECHEAP_USERNAME, NAMECHEAP_SANDBOX (optional)
`;
const MANY = Array.from({ length: 51 }, (_, i) => `a${i}.com`);
const json = (data: unknown) => `${JSON.stringify(data, null, 2)}\n`;

interface CliCase {
	args: string[];
	env?: Record<string, string>;
	code: number;
	stdout?: string;
	stderr?: string;
	requests?: RecordedRequest[];
}

// Usage errors run without configuration, so an argument check that moves after the config read fails.
const CLI: CliCase[] = [
	{ args: ["--help"], code: 0, stdout: USAGE },
	{ args: ["-h"], code: 0, stdout: USAGE },
	{ args: [], code: 2, stdout: USAGE },
	{ args: ["bogus"], code: 2, stderr: 'Unknown command "bogus"\n' },
	{
		args: ["--unknown"],
		code: 2,
		stderr: `Unknown option '--unknown'. To specify a positional argument starting with a '-', place it at the end of the command after '--', as in '-- "--unknown"\n`,
	},
	{
		args: ["tlds"],
		code: 1,
		stderr:
			"Missing required environment variables: NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_CLIENT_IP\n",
	},
	{
		args: ["pricing", "com"],
		env: { ...FAKE_ENV, NAMECHEAP_API_KEY: "wrong-secret-key" },
		code: 1,
		stderr:
			"Namecheap API error: API Key is invalid or API access has not been enabled\n",
		requests: [pricing("com", "REGISTER")],
	},
	{
		args: ["check", "example.com", "rarebrand.io"],
		env: FAKE_ENV,
		code: 0,
		stdout: `${CHECK_TEXT}\n`,
		requests: [check("example.com,rarebrand.io")],
	},
	{
		args: ["check", "example.com,rarebrand.io", "--json"],
		env: FAKE_ENV,
		code: 0,
		stdout: json([
			{ domain: "example.com", available: false, premium: false },
			{
				domain: "rarebrand.io",
				available: true,
				premium: true,
				premiumPrice: 1500,
				premiumRenewalPrice: 1500,
				icannFee: 0.18,
			},
		]),
		requests: [check("example.com,rarebrand.io")],
	},
	{
		args: ["search", "brand"],
		env: FAKE_ENV,
		code: 0,
		stdout: `${SEARCH_TEXT}\n`,
		requests: [DEFAULT_SEARCH],
	},
	{
		args: ["search", "brand", "--tlds", "com,.IO", "--json"],
		env: FAKE_ENV,
		code: 0,
		stdout: json([
			{ domain: "brand.com", available: false, premium: false },
			{ domain: "brand.io", available: true, premium: false },
		]),
		requests: [check("brand.com,brand.io")],
	},
	{
		args: ["pricing", ".COM"],
		env: FAKE_ENV,
		code: 0,
		stdout: `${pricingText("com", "REGISTER")}\n`,
		requests: [pricing("com", "REGISTER")],
	},
	{
		args: ["pricing", "io", "--action", "renew", "--json"],
		env: { ...FAKE_ENV, NAMECHEAP_SANDBOX: "true" },
		code: 0,
		stdout: json({ tld: "io", action: "RENEW", prices: PRICES }),
		requests: [{ ...pricing("io", "RENEW"), origin: SANDBOX }],
	},
	{
		args: ["tlds"],
		env: { ...FAKE_ENV, NAMECHEAP_USERNAME: "account-owner" },
		code: 0,
		stdout: `${TLDS_TEXT}\n`,
		requests: [tldList({ UserName: "account-owner" })],
	},
	{
		args: ["tlds", "--json", "--sandbox"],
		env: FAKE_ENV,
		code: 0,
		stdout: json([
			{ name: "com", apiRegisterable: true },
			{ name: "museum", apiRegisterable: false },
		]),
		requests: [tldList({}, SANDBOX)],
	},
	...(
		[
			[["check"], "check: at least one domain is required"],
			[
				["check", "a.com", "--tlds", "com"],
				"--tlds is only supported by search",
			],
			[["check", ...MANY], "At most 50 domains can be checked per request"],
			[["search", "a", "b"], "search: exactly one argument is required"],
			[["search", ""], "search: the keyword must be one non-empty name"],
			[["search", "a,b"], "search: the keyword must be one non-empty name"],
			[["search", "a", "--tlds", ",,"], "search: --tlds must contain TLDs"],
			[
				["search", "a", "--tlds", MANY.map((_, i) => `t${i}`).join(",")],
				"At most 50 domains can be checked per request",
			],
			[["pricing", "com", "--action", "bad"], 'pricing: unknown action "bad"'],
			[["pricing", "a", "b"], "pricing: exactly one argument is required"],
			[["pricing", "."], "pricing: a TLD is required"],
			[["tlds", "--action", "RENEW"], "--action is only supported by pricing"],
			[["tlds", "extra"], "tlds: no arguments are supported"],
		] as const
	).map(([args, message]) => ({
		args: [...args],
		code: 2,
		stderr: `${message}\n`,
	})),
];

it.each(CLI)("CLI $args", ({ args, env, ...expected }) => {
	expectExact(run(bin.namecheap, args, env), {
		stdout: "",
		stderr: "",
		requests: [],
		...expected,
	});
});

const rpc = (id: number, method: string, params = {}) => ({
	jsonrpc: "2.0",
	id,
	method,
	params,
});
const INITIALIZE = rpc(0, "initialize", {
	protocolVersion: "2025-03-26",
	capabilities: {},
	clientInfo: { name: "surfaces", version: "1" },
});
const SERVER = {
	protocolVersion: "2025-03-26",
	capabilities: { tools: { listChanged: true } },
	serverInfo: { name: "namecheap", version: "1.0.0" },
};
const tool = (
	name: string,
	description: string,
	properties: object,
	required?: string[],
) => ({
	name,
	description,
	inputSchema: {
		$schema: "http://json-schema.org/draft-07/schema#",
		type: "object",
		properties,
		...(required && { required }),
	},
	execution: { taskSupport: "forbidden" },
});
const string = (description: string) => ({ type: "string", description });
const TOOLS = [
	tool(
		"check_domains",
		"Check availability of one or more domain names (e.g. 'example.com,test.io')",
		{
			domains: string(
				"Comma-separated list of full domain names to check (e.g. 'mybrand.com,mybrand.io')",
			),
		},
		["domains"],
	),
	tool(
		"search_domains",
		"Search for a keyword across popular TLDs to find available domain names",
		{
			keyword: string("The keyword or brand name to search (without TLD)"),
			tlds: string(`Comma-separated TLDs to check (default: ${DEFAULT_TLDS})`),
		},
		["keyword"],
	),
	tool(
		"get_pricing",
		"Get Namecheap pricing for domain registration, renewal, or transfer by TLD",
		{
			tld: string("The TLD to get pricing for (e.g. 'com', 'io', 'dev')"),
			action: {
				...string("Price action type (default: REGISTER)"),
				enum: ["REGISTER", "RENEW", "TRANSFER"],
			},
		},
		["tld"],
	),
	tool("get_tld_list", "Get the list of all TLDs supported by Namecheap", {}),
];

const text = (value: string) => ({ content: [{ type: "text", text: value }] });
interface ToolCall {
	name: string;
	arguments: object;
	result: object;
	requests: RecordedRequest[];
}
const failed = (message: string) => ({ ...text(message), isError: true });
const TOOL_CALLS: ToolCall[] = [
	{
		name: "check_domains",
		arguments: { domains: "example.com, rarebrand.io" },
		result: text(CHECK_TEXT),
		requests: [check("example.com,rarebrand.io")],
	},
	{
		name: "check_domains",
		arguments: { domains: "down.invalid" },
		result: failed("Domain check failed for down.invalid: Provider failure"),
		requests: [check("down.invalid")],
	},
	{
		name: "check_domains",
		arguments: { domains: "outage.test" },
		result: failed(
			"Unexpected non-XML response from Namecheap API (HTTP 500).",
		),
		requests: [check("outage.test")],
	},
	{
		name: "check_domains",
		arguments: { domains: MANY.join(",") },
		result: failed("At most 50 domains can be checked per request"),
		requests: [],
	},
	{
		name: "search_domains",
		arguments: { keyword: "brand" },
		result: text(SEARCH_TEXT),
		requests: [DEFAULT_SEARCH],
	},
	{
		name: "search_domains",
		arguments: { keyword: "brand", tlds: "com,.IO" },
		result: text(
			'Domain search for "brand":\n\nAvailable (1):\nbrand.io — ✅ Available\n\nTaken (1):\nbrand.com — ❌ Taken',
		),
		requests: [check("brand.com,brand.io")],
	},
	{
		name: "get_pricing",
		arguments: { tld: ".COM" },
		result: text(pricingText("com", "REGISTER")),
		requests: [pricing("com", "REGISTER")],
	},
	{
		name: "get_pricing",
		arguments: { tld: "io", action: "RENEW" },
		result: text(pricingText("io", "RENEW")),
		requests: [pricing("io", "RENEW")],
	},
	{
		name: "get_tld_list",
		arguments: {},
		result: text(TLDS_TEXT),
		requests: [tldList()],
	},
];

function stdio(request: object) {
	const input = [
		INITIALIZE,
		{ jsonrpc: "2.0", method: "notifications/initialized" },
		request,
	]
		.map((message) => `${JSON.stringify(message)}\n`)
		.join("");
	const result = run(bin["namecheap-stdio"], [], FAKE_ENV, input);
	return {
		...result,
		stdout: result.stdout
			.split("\n")
			.filter(Boolean)
			.map((line) => JSON.parse(line)),
	};
}

function post(message: object, token: string | null = TOKEN) {
	return new Request("https://worker.test/mcp", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			...(token === null ? {} : { Authorization: `Bearer ${token}` }),
		},
		body: JSON.stringify(message),
	});
}

async function fetchWorker(request: Request, env: Env = WORKER_ENV) {
	const response = await worker.fetch(request, env);
	const body = await response.text();
	return {
		status: response.status,
		headers: Object.fromEntries(response.headers),
		body:
			response.headers.get("content-type") === "application/json"
				? JSON.parse(body)
				: body,
		requests: drain(WORKER_LOG),
	};
}

it("stdio refuses to start without configuration", () => {
	expectExact(run(bin["namecheap-stdio"], []), {
		code: 1,
		stdout: "",
		stderr:
			"Missing required environment variables: NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_CLIENT_IP\n",
		requests: [],
	});
});

it("stdio initializes and lists the tools", () => {
	expectExact(stdio(rpc(1, "tools/list")), {
		code: 0,
		stdout: [
			{ jsonrpc: "2.0", id: 0, result: SERVER },
			{ jsonrpc: "2.0", id: 1, result: { tools: TOOLS } },
		],
		stderr: "",
		requests: [],
	});
});

describe.each(TOOL_CALLS)("tool $name $arguments", ({
	name,
	arguments: args,
	result,
	requests,
}) => {
	const call = rpc(1, "tools/call", { name, arguments: args });
	it("over stdio", () => {
		expectExact(stdio(call), {
			code: 0,
			stdout: [
				{ jsonrpc: "2.0", id: 0, result: SERVER },
				{ jsonrpc: "2.0", id: 1, result },
			],
			stderr: "",
			requests,
		});
	});
	it("over the Worker", async () => {
		expectExact(await fetchWorker(post(call)), {
			status: 200,
			headers: { "content-type": "application/json" },
			body: { jsonrpc: "2.0", id: 1, result },
			requests,
		});
	});
});

const TEXT = { "content-type": "text/plain;charset=UTF-8" };
const UNAUTHORIZED = {
	status: 401,
	headers: {
		...TEXT,
		"www-authenticate": 'Bearer realm="mcp", error="invalid_token"',
	},
	body: "Unauthorized",
};
const NOT_ALLOWED = {
	status: 405,
	headers: { allow: "POST", "content-type": "application/json" },
	body: {
		jsonrpc: "2.0",
		error: { code: -32000, message: "Method not allowed" },
		id: null,
	},
};
// A tool call is the only request that reaches Namecheap, so the guards are tried against one.
const TOOL_CALL = rpc(1, "tools/call", {
	name: "check_domains",
	arguments: { domains: "example.com" },
});
const ROUTE_CASES: [string, Request, Env, object][] = [
	[
		"health",
		new Request("https://worker.test/health"),
		{},
		{ status: 200, headers: TEXT, body: "ok" },
	],
	[
		"an undeclared path",
		new Request("https://worker.test/mcp/"),
		WORKER_ENV,
		{ status: 404, headers: TEXT, body: "Not found" },
	],
	[
		"initialize without a session",
		post(INITIALIZE),
		WORKER_ENV,
		{
			status: 200,
			headers: { "content-type": "application/json" },
			body: { jsonrpc: "2.0", id: 0, result: SERVER },
		},
	],
	[
		"tools/list",
		post(rpc(1, "tools/list")),
		WORKER_ENV,
		{
			status: 200,
			headers: { "content-type": "application/json" },
			body: { jsonrpc: "2.0", id: 1, result: { tools: TOOLS } },
		},
	],
	["a wrong token", post(TOOL_CALL, "wrong-secret"), WORKER_ENV, UNAUTHORIZED],
	["no Authorization header", post(TOOL_CALL, null), WORKER_ENV, UNAUTHORIZED],
	[
		"no configured token, even with ALLOW_UNAUTHENTICATED",
		post(TOOL_CALL),
		{ ...FAKE_ENV, ALLOW_UNAUTHENTICATED: "true" },
		{
			status: 503,
			headers: TEXT,
			body: "MCP server is not configured for access. Set MCP_AUTH_TOKEN.",
		},
	],
	[
		"missing Namecheap configuration",
		post(TOOL_CALL),
		{ MCP_AUTH_TOKEN: TOKEN },
		{
			status: 503,
			headers: { "content-type": "application/json" },
			body: {
				jsonrpc: "2.0",
				error: {
					code: -32603,
					message:
						"Missing required environment variables: NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_CLIENT_IP",
				},
				id: null,
			},
		},
	],
	...(["GET", "DELETE"].map((method) => [
		`${method} without opening a session or stream`,
		new Request("https://worker.test/mcp", {
			method,
			headers: {
				Authorization: `Bearer ${TOKEN}`,
				Accept: "text/event-stream",
			},
		}),
		WORKER_ENV,
		NOT_ALLOWED,
	]) as [string, Request, Env, object][]),
];

it.each(ROUTE_CASES)("Worker %s", async (_, request, env, expected) => {
	expectExact(await fetchWorker(request, env), { requests: [], ...expected });
});

it("has a case for every declared command, output mode, tool, and route", async () => {
	const cliModes = CLI.map(({ args, code }) => {
		if (code !== 0) return `${args[0]} exit ${code}`;
		return `${args[0]} ${args.includes("--json") ? "json" : "text"}`;
	});
	for (const command of Object.keys(COMMANDS))
		expect(cliModes).toEqual(
			expect.arrayContaining(
				["text", "json", "exit 2"].map((mode) => `${command} ${mode}`),
			),
		);
	const listed = await fetchWorker(post(rpc(1, "tools/list")));
	expect([...new Set(TOOL_CALLS.map(({ name }) => name))]).toEqual(
		listed.body.result.tools.map(({ name }: { name: string }) => name),
	);
	const paths = ROUTE_CASES.map(([, request]) => new URL(request.url).pathname);
	expect(paths).toEqual(expect.arrayContaining(Object.keys(ROUTES)));
});
