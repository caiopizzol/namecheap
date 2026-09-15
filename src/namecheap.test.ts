import { describe, expect, it } from "vitest";
import {
	NamecheapClient,
	NamecheapError,
	parseApiResponse,
	parseDomainCheckResults,
	parsePricing,
	parseTldList,
	readConfigFromEnv,
	splitList,
} from "./namecheap.js";

const CHECK_XML = `<?xml version="1.0" encoding="utf-8"?>
<ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
  <Errors />
  <RequestedCommand>namecheap.domains.check</RequestedCommand>
  <CommandResponse Type="namecheap.domains.check">
    <DomainCheckResult Domain="example.com" Available="false" ErrorNo="0" Description="" IsPremiumName="false" PremiumRegistrationPrice="0" PremiumRenewalPrice="0" PremiumRestorePrice="0" PremiumTransferPrice="0" IcannFee="0" EapFee="0" />
    <DomainCheckResult Domain="rarebrand.io" Available="true" ErrorNo="0" Description="" IsPremiumName="true" PremiumRegistrationPrice="1500.00" PremiumRenewalPrice="1500.00" PremiumRestorePrice="0" PremiumTransferPrice="0" IcannFee="0.18" EapFee="0" />
  </CommandResponse>
</ApiResponse>`;

const ERROR_XML = `<?xml version="1.0" encoding="utf-8"?>
<ApiResponse Status="ERROR" xmlns="http://api.namecheap.com/xml.response">
  <Errors>
    <Error Number="1011150">Invalid request IP: 203.0.113.9</Error>
  </Errors>
</ApiResponse>`;

const PRICING_XML = `<?xml version="1.0" encoding="utf-8"?>
<ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
  <CommandResponse Type="namecheap.users.getPricing">
    <UserGetPricingResult>
      <ProductType Name="domains">
        <ProductCategory Name="register">
          <Product Name="com">
            <Price Duration="1" DurationType="YEAR" Price="10.28" RegularPrice="13.98" YourPrice="10.28" Currency="USD" />
            <Price Duration="2" DurationType="YEAR" Price="13.98" RegularPrice="13.98" YourPrice="13.98" Currency="USD" />
          </Product>
        </ProductCategory>
      </ProductType>
    </UserGetPricingResult>
  </CommandResponse>
</ApiResponse>`;

const TLD_XML = `<?xml version="1.0" encoding="utf-8"?>
<ApiResponse Status="OK" xmlns="http://api.namecheap.com/xml.response">
  <CommandResponse Type="namecheap.domains.getTldList">
    <Tlds>
      <Tld Name="com" IsApiRegisterable="true">Commercial</Tld>
      <Tld Name="museum" IsApiRegisterable="false">Museums</Tld>
    </Tlds>
  </CommandResponse>
</ApiResponse>`;

describe("parseApiResponse", () => {
	it("throws NamecheapError with the API message on ERROR status", () => {
		expect(() => parseApiResponse(ERROR_XML)).toThrow(NamecheapError);
		expect(() => parseApiResponse(ERROR_XML)).toThrow(
			"Invalid request IP: 203.0.113.9",
		);
	});

	it("throws on non-XML bodies and reports the HTTP status", () => {
		expect(() => parseApiResponse("<html>nope</html>", 500)).toThrow(
			"non-XML response from Namecheap API (HTTP 500)",
		);
	});
});

describe("parsers", () => {
	it("parses domain check results including premium and icann fee", () => {
		const results = parseDomainCheckResults(parseApiResponse(CHECK_XML));
		expect(results).toEqual([
			{ domain: "example.com", available: false, premium: false },
			{
				domain: "rarebrand.io",
				available: true,
				premium: true,
				premiumPrice: 1500,
				premiumRenewalPrice: 1500,
				icannFee: 0.18,
			},
		]);
	});

	it("parses a single-result response as an array", () => {
		const single = CHECK_XML.replace(
			/<DomainCheckResult Domain="rarebrand.io"[^>]*\/>/,
			"",
		);
		expect(parseDomainCheckResults(parseApiResponse(single))).toHaveLength(1);
	});

	it("parses pricing", () => {
		const prices = parsePricing(parseApiResponse(PRICING_XML));
		expect(prices).toEqual([
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
		]);
	});

	it("parses the TLD list", () => {
		expect(parseTldList(parseApiResponse(TLD_XML))).toEqual([
			{ name: "com", apiRegisterable: true },
			{ name: "museum", apiRegisterable: false },
		]);
	});
});

describe("readConfigFromEnv", () => {
	it("lists every missing required variable", () => {
		expect(() => readConfigFromEnv({})).toThrow(
			"NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_CLIENT_IP",
		);
	});

	it("reads sandbox and optional username", () => {
		const config = readConfigFromEnv({
			NAMECHEAP_API_USER: "u",
			NAMECHEAP_API_KEY: "k",
			NAMECHEAP_CLIENT_IP: "203.0.113.9",
			NAMECHEAP_SANDBOX: "true",
		});
		expect(config).toEqual({
			apiUser: "u",
			apiKey: "k",
			clientIp: "203.0.113.9",
			sandbox: true,
			userName: undefined,
		});
	});
});

describe("NamecheapClient", () => {
	const config = {
		apiUser: "u",
		apiKey: "k",
		clientIp: "203.0.113.9",
		sandbox: true,
	};

	it("builds the request URL with credentials and command params", async () => {
		const calls: string[] = [];
		const client = new NamecheapClient(config, async (url) => {
			calls.push(url);
			return { status: 200, text: async () => CHECK_XML };
		});
		await client.searchDomains("brand", ["com", ".IO"]);
		const url = new URL(calls[0]);
		expect(url.origin).toBe("https://api.sandbox.namecheap.com");
		expect(url.searchParams.get("Command")).toBe("namecheap.domains.check");
		expect(url.searchParams.get("DomainList")).toBe("brand.com,brand.io");
		expect(url.searchParams.get("UserName")).toBe("u");
		expect(url.searchParams.get("ClientIp")).toBe("203.0.113.9");
	});

	it("rejects an empty domain list before calling the API", async () => {
		const client = new NamecheapClient(config, async () => {
			throw new Error("should not be called");
		});
		await expect(client.checkDomains([])).rejects.toThrow(
			"No domains provided",
		);
	});

	it("splitList trims and drops empties", () => {
		expect(splitList(" a.com, b.io ,,")).toEqual(["a.com", "b.io"]);
	});
});

it("rejects oversized checks without making a request", async () => {
	let calls = 0;
	const client = new NamecheapClient(
		{ apiUser: "u", apiKey: "k", clientIp: "203.0.113.1" },
		async () => {
			calls++;
			return { status: 200, text: async () => CHECK_XML };
		},
	);
	await expect(
		client.checkDomains(Array.from({ length: 51 }, (_, i) => `a${i}.com`)),
	).rejects.toThrow("At most 50");
	expect(calls).toBe(0);
});
it("does not report a per-domain provider error as a taken domain", () => {
	expect(() =>
		parseDomainCheckResults({
			DomainCheckResult: {
				"@_Domain": "example.com",
				"@_Available": "false",
				"@_ErrorNo": "3031510",
				"@_Description": "Provider failure",
			},
		}),
	).toThrow("Provider failure");
});
