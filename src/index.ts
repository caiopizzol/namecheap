#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools, SERVER_INFO } from "./mcp-tools.js";
import { NamecheapClient, readConfigFromEnv } from "./namecheap.js";

async function main() {
	let client: NamecheapClient;
	try {
		client = new NamecheapClient(readConfigFromEnv(process.env));
	} catch (err) {
		console.error((err as Error).message);
		process.exit(1);
	}

	const server = new McpServer(SERVER_INFO);
	registerTools(server, client);
	await server.connect(new StdioServerTransport());
}

main().catch(() => {
	console.error("Failed to start Namecheap MCP server");
	process.exitCode = 1;
});
