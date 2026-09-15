import type { DomainCheckResult, PriceEntry, TldEntry } from "./namecheap.js";

export function formatDomainResults(results: DomainCheckResult[]): string {
	return results
		.map((r) => {
			const status = r.available ? "✅ Available" : "❌ Taken";
			let line = `${r.domain} — ${status}`;
			if (r.premium && r.premiumPrice) {
				line += ` (Premium: $${r.premiumPrice}/yr)`;
			}
			return line;
		})
		.join("\n");
}

export function formatSearchResults(
	keyword: string,
	results: DomainCheckResult[],
): string {
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
	return text;
}

export function formatPricing(
	tld: string,
	action: string,
	prices: PriceEntry[],
): string {
	if (prices.length === 0) return `No pricing found for .${tld}`;
	const lines = prices.map((p) => {
		let line = `.${tld} — ${p.duration} ${p.durationType}: $${p.price} ${p.currency}`;
		if (p.price !== p.regularPrice) {
			line += ` (regular: $${p.regularPrice})`;
		}
		return line;
	});
	return `${action} pricing for .${tld}:\n\n${lines.join("\n")}`;
}

export function formatTldList(tlds: TldEntry[]): string {
	if (tlds.length === 0) return "Could not retrieve TLD list.";
	const lines = tlds.map(
		(t) => `.${t.name}${t.apiRegisterable ? "" : " (not available via API)"}`,
	);
	return `Supported TLDs (${lines.length}):\n\n${lines.join("\n")}`;
}
