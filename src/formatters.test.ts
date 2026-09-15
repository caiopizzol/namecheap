import { expect, it } from "vitest";
import {
	formatDomainResults,
	formatPricing,
	formatSearchResults,
	formatTldList,
} from "./formatters.js";
import type { DomainCheckResult } from "./namecheap.js";

const domains: DomainCheckResult[] = [
	{ domain: "example.com", available: false, premium: false },
	{
		domain: "rarebrand.io",
		available: true,
		premium: true,
		premiumPrice: 1500,
	},
];

it("formats domain availability and premium pricing", () => {
	expect(formatDomainResults(domains)).toBe(
		"example.com — ❌ Taken\nrarebrand.io — ✅ Available (Premium: $1500/yr)",
	);
});
it("groups search results into available and taken domains", () => {
	const text = formatSearchResults("x", domains);
	expect(text).toContain("Available (1):");
	expect(text).toContain("Taken (1):");
});
it("formats registration pricing and missing prices", () => {
	expect(
		formatPricing("com", "REGISTER", [
			{
				duration: 1,
				durationType: "YEAR",
				price: 10.28,
				regularPrice: 13.98,
				currency: "USD",
			},
		]),
	).toContain(".com — 1 YEAR: $10.28 USD (regular: $13.98)");
	expect(formatPricing("com", "REGISTER", [])).toBe(
		"No pricing found for .com",
	);
});
it("marks TLDs unavailable through the API", () => {
	expect(formatTldList([{ name: "museum", apiRegisterable: false }])).toContain(
		".museum (not available via API)",
	);
});
