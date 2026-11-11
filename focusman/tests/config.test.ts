import { describe, expect, test } from "bun:test";
import { DEFAULT_CONFIG, mergeConfig } from "../lib/config";

describe("Config - browser ports", () => {
	test("defaults to [9222] when no browser ports are specified", () => {
		const config = mergeConfig({});
		expect(config.browser.ports).toEqual([9222]);
	});

	test("parses array of valid ports", () => {
		const config = mergeConfig({
			browser: {
				ports: [9222, 9223, 9224],
			},
		});
		expect(config.browser.ports).toEqual([9222, 9223, 9224]);
	});

	test("filters out invalid ports and falls back to default if all are invalid", () => {
		const config = mergeConfig({
			browser: {
				ports: [-1, 0, 70000, "invalid"],
			},
		});
		expect(config.browser.ports).toEqual([9222]);
	});

	test("handles string numbers in array", () => {
		const config = mergeConfig({
			browser: {
				ports: ["9222", "9225"],
			},
		});
		expect(config.browser.ports).toEqual([9222, 9225]);
	});

	test("handles single number or single port property gracefully", () => {
		const config = mergeConfig({
			browser: {
				ports: 9223,
			},
		});
		expect(config.browser.ports).toEqual([9223]);
	});
});
