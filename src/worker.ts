import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CfWorkerJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/cfworker";
import { registerTools, SERVER_INFO } from "./mcp-tools.js";
import { NamecheapClient, readConfigFromEnv } from "./namecheap.js";

export interface Env {
	[key: string]: string | undefined;
	NAMECHEAP_API_USER?: string;
	NAMECHEAP_API_KEY?: string;
	NAMECHEAP_USERNAME?: string;
	NAMECHEAP_CLIENT_IP?: string;
	NAMECHEAP_SANDBOX?: string;
	MCP_AUTH_TOKEN?: string;
}

const MCP_PATH = "/mcp";

function constantTimeEqual(a: string, b: string): boolean {
	const aBytes = new TextEncoder().encode(a);
	const bBytes = new TextEncoder().encode(b);
	if (aBytes.length !== bBytes.length) return false;
	let diff = 0;
	for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
	return diff === 0;
}

function authorize(request: Request, env: Env): Response | null {
	if (env.MCP_AUTH_TOKEN) {
		const header = request.headers.get("authorization") ?? "";
		const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
		if (!constantTimeEqual(presented, env.MCP_AUTH_TOKEN)) {
			return new Response("Unauthorized", {
				status: 401,
				headers: {
					"WWW-Authenticate": 'Bearer realm="mcp", error="invalid_token"',
				},
			});
		}
		return null;
	}
	return new Response(
		"MCP server is not configured for access. Set MCP_AUTH_TOKEN.",
		{ status: 503 },
	);
}

function jsonRpcError(code: number, message: string, status: number): Response {
	return new Response(
		JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }),
		{ status, headers: { "content-type": "application/json" } },
	);
}

async function handleMcp(request: Request, env: Env): Promise<Response> {
	let client: NamecheapClient;
	try {
		client = new NamecheapClient(readConfigFromEnv(env));
	} catch (err) {
		return jsonRpcError(-32603, (err as Error).message, 503);
	}
	const server = new McpServer(SERVER_INFO, {
		jsonSchemaValidator: new CfWorkerJsonSchemaValidator(),
	});
	registerTools(server, client);
	// Stateless: one server + transport per request, no session id.
	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	});
	await server.connect(transport);
	try {
		return await transport.handleRequest(request);
	} finally {
		await server.close();
	}
}

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const { pathname } = new URL(request.url);
		if (pathname === "/health") {
			return new Response("ok");
		}
		if (pathname !== MCP_PATH) {
			return new Response("Not found", { status: 404 });
		}
		const denied = authorize(request, env);
		if (denied) return denied;
		if (request.method !== "POST") {
			const response = jsonRpcError(-32000, "Method not allowed", 405);
			response.headers.set("Allow", "POST");
			return response;
		}
		try {
			return await handleMcp(request, env);
		} catch {
			return jsonRpcError(-32603, "Internal server error", 500);
		}
	},
};
