import { afterEach, expect, it, vi } from "vitest";
import worker, { type Env } from "./worker.js";

const env: Env = {
	MCP_AUTH_TOKEN: "test-token",
	NAMECHEAP_API_USER: "u",
	NAMECHEAP_API_KEY: "k",
	NAMECHEAP_CLIENT_IP: "203.0.113.1",
};
function request(method: string, params = {}, token = "test-token") {
	return new Request("https://example.test/mcp", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
	});
}
afterEach(() => vi.unstubAllGlobals());
it("requires a configured token even when ALLOW_UNAUTHENTICATED is set", async () => {
	expect(
		(
			await worker.fetch(request("tools/list"), {
				...env,
				MCP_AUTH_TOKEN: undefined,
				ALLOW_UNAUTHENTICATED: "true",
			})
		).status,
	).toBe(503);
});
it("rejects incorrect tokens before fetching upstream", async () => {
	const fetch = vi.fn();
	vi.stubGlobal("fetch", fetch);
	expect(
		(await worker.fetch(request("tools/list", {}, "wrong"), env)).status,
	).toBe(401);
	expect(fetch).not.toHaveBeenCalled();
});
it("initializes and lists tools without session state", async () => {
	const response = await worker.fetch(
		request("initialize", {
			protocolVersion: "2025-03-26",
			capabilities: {},
			clientInfo: { name: "test", version: "1" },
		}),
		env,
	);
	expect(response.status).toBe(200);
	expect(response.headers.get("mcp-session-id")).toBeNull();
	const list = await worker.fetch(request("tools/list"), env);
	expect(
		((await list.json()) as { result: { tools: unknown[] } }).result.tools,
	).toHaveLength(4);
});
it("returns a successful tool result after closing the request transport", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(
			async () =>
				new Response(
					'<ApiResponse Status="OK"><CommandResponse><DomainCheckResult Domain="example.com" Available="false" ErrorNo="0" IsPremiumName="false" /></CommandResponse></ApiResponse>',
				),
		),
	);
	const response = await worker.fetch(
		request("tools/call", {
			name: "check_domains",
			arguments: { domains: "example.com" },
		}),
		env,
	);
	expect(response.status).toBe(200);
	expect(
		((await response.json()) as { result: { content: { text: string }[] } })
			.result.content[0].text,
	).toContain("Taken");
});
it("returns upstream failures as tool errors", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response("<html>failure</html>", { status: 500 })),
	);
	const response = await worker.fetch(
		request("tools/call", {
			name: "check_domains",
			arguments: { domains: "example.com" },
		}),
		env,
	);
	const body = (await response.json()) as {
		result: { isError: boolean; content: { text: string }[] };
	};
	expect(body.result.isError).toBe(true);
	expect(body.result.content[0].text).toContain("HTTP 500");
});

it.each([
	"GET",
	"DELETE",
])("rejects %s without opening a session or stream", async (method) => {
	const response = await worker.fetch(
		new Request("https://example.test/mcp", {
			method,
			headers: {
				Authorization: "Bearer test-token",
				Accept: "text/event-stream",
			},
		}),
		env,
	);
	expect(response.status).toBe(405);
	expect(response.headers.get("Allow")).toBe("POST");
	expect(await response.json()).toMatchObject({
		jsonrpc: "2.0",
		error: { message: "Method not allowed" },
	});
});
