import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "namecheap-cli-"));
const preload = join(dir, "fetch.mjs");
const env = Object.fromEntries(
	Object.entries(process.env).filter(
		([key]) => !key.startsWith("NAMECHEAP_") && key !== "NODE_OPTIONS",
	),
);
beforeAll(() => {
	execFileSync("bun", ["run", "build"]);
	writeFileSync(
		preload,
		`globalThis.fetch = async (url) => { if (process.env.MOCK_ERROR) throw new Error("upstream unavailable"); if (new URL(url).hostname !== "api.sandbox.namecheap.com") throw new Error("expected sandbox"); return new Response('<ApiResponse Status="OK"><CommandResponse><DomainCheckResult Domain="example.com" Available="false" ErrorNo="0" IsPremiumName="false" /></CommandResponse></ApiResponse>'); };`,
	);
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
function run(args: string[], configured = false, error = false) {
	return spawnSync("node", ["--import", preload, "dist/cli.js", ...args], {
		encoding: "utf8",
		env: {
			...env,
			...(configured
				? {
						NAMECHEAP_API_USER: "u",
						NAMECHEAP_API_KEY: "k",
						NAMECHEAP_CLIENT_IP: "203.0.113.1",
					}
				: {}),
			...(error ? { MOCK_ERROR: "true" } : {}),
		},
	});
}
it.each([
	["--unknown"],
	["check"],
	["bogus"],
	["pricing", "com", "--action", "bad"],
	["search", "a", "b"],
	["tlds", "extra"],
	["check", "a.com", "--tlds", "com"],
	["search", "a", "--tlds", ",,"],
	["check", ...Array.from({ length: 51 }, (_, i) => `a${i}.com`)],
])("rejects usage before configuration: %j", (...args) => {
	const result = run(args);
	expect(result.status).toBe(2);
	expect(result.stderr).not.toContain("Missing required");
});
it("shows help without credentials", () => {
	expect(run(["--help"]).status).toBe(0);
});
it("returns configuration failures on stderr", () => {
	const r = run(["check", "example.com"]);
	expect(r.status).toBe(1);
	expect(r.stdout).toBe("");
	expect(r.stderr).toContain("Missing required");
});
it("prints JSON from a successful sandbox request", () => {
	const r = run(["check", "example.com", "--json", "--sandbox"], true);
	expect(r.status).toBe(0);
	expect(r.stderr).toBe("");
	expect(JSON.parse(r.stdout)).toEqual([
		{ domain: "example.com", available: false, premium: false },
	]);
});
it("returns API failures on stderr", () => {
	const r = run(["check", "example.com"], true, true);
	expect(r.status).toBe(1);
	expect(r.stdout).toBe("");
	expect(r.stderr).toContain("upstream unavailable");
});
