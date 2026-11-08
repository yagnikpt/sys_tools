import {
	type BrowserConfig,
	DEFAULT_CONFIG,
	type DecisionConfig,
} from "../lib/config";
import { DecisionClient, type DecisionResult } from "../lib/decision";
import {
	BROWSER_PROMPT_TEMPLATE,
	formatStateFromBrowser,
} from "../lib/prompts";
import { getMetaDescription } from "../lib/utils";

export class BrowserMonitorGuard {
	private cache = new Map<string, { result: DecisionResult; expiry: number }>();
	private readonly cacheTtlMs: number;
	private client: DecisionClient;
	private allowList: string[];
	private homepageAllowList: string[];
	private denyList: string[];

	constructor(
		browserConfig?: Partial<BrowserConfig>,
		decisionConfig?: Partial<DecisionConfig>,
		client?: DecisionClient,
	) {
		this.allowList =
			browserConfig?.allow_list ?? DEFAULT_CONFIG.browser.allow_list;
		this.homepageAllowList =
			browserConfig?.homepage_allow_list ??
			DEFAULT_CONFIG.browser.homepage_allow_list;
		this.denyList =
			browserConfig?.deny_list ?? DEFAULT_CONFIG.browser.deny_list;

		const ttlMinutes =
			decisionConfig?.cache_ttl_minutes ??
			DEFAULT_CONFIG.decision.cache_ttl_minutes;
		this.cacheTtlMs = ttlMinutes * 60 * 1000;

		const apiKey = decisionConfig?.api_key || (process.env.API_KEY as string);
		const endpoint =
			decisionConfig?.endpoint ?? DEFAULT_CONFIG.decision.endpoint;
		const model = decisionConfig?.model ?? DEFAULT_CONFIG.decision.model;

		this.client = client ?? new DecisionClient(apiKey, endpoint, model);
	}

	async checkActivity(
		intent: string,
		title: string,
		url: string,
	): Promise<DecisionResult> {
		// 1. Tier 0: Domain fast paths
		let parsedUrl: URL;
		try {
			parsedUrl = new URL(url);
		} catch {
			return {
				isOffTask: false,
				alignment: "direct",
				confidence: 1.0,
				probDistracted: 0.0,
			};
		}

		if (
			this.allowList.some((domain) =>
				parsedUrl.hostname.toLowerCase().endsWith(domain.toLowerCase()),
			)
		) {
			return {
				isOffTask: false,
				alignment: "direct",
				confidence: 1.0,
				probDistracted: 0.0,
			};
		}

		if (
			parsedUrl.pathname === "/" &&
			this.homepageAllowList.some((domain) =>
				parsedUrl.hostname.toLowerCase().endsWith(domain.toLowerCase()),
			)
		) {
			return {
				isOffTask: false,
				alignment: "direct",
				confidence: 1.0,
				probDistracted: 0.0,
			};
		}

		if (url.includes("newtab") || title === "New Tab") {
			return {
				isOffTask: false,
				alignment: "direct",
				confidence: 1.0,
				probDistracted: 0.0,
			};
		}

		if (
			this.denyList.some((domain) =>
				url.toLowerCase().includes(domain.toLowerCase()),
			)
		) {
			return {
				isOffTask: true,
				alignment: "distraction",
				confidence: 1.0,
				probDistracted: 1.0,
			};
		}

		// 2. Tier 1: Cache check
		const cacheKey = `${intent.toLowerCase()}::${parsedUrl.hostname}::${parsedUrl.pathname}`;
		const cached = this.cache.get(cacheKey);
		if (cached && Date.now() < cached.expiry) {
			return cached.result;
		}

		// 3. Tier 2: System One Decision Call
		const desc = await getMetaDescription(url);
		const state = formatStateFromBrowser(intent, title, desc, url);

		const result = await this.client.evaluate(
			state,
			BROWSER_PROMPT_TEMPLATE,
			`${url} - ${title}`,
		);

		// Store in cache
		this.cache.set(cacheKey, {
			result,
			expiry: Date.now() + this.cacheTtlMs,
		});
		return result;
	}
}
