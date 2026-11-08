import { DecisionClient, type DecisionResult } from "../lib/decision";
import {
	BROWSER_PROMPT_TEMPLATE,
	formatStateFromBrowser,
} from "../lib/prompts";
import { getMetaDescription } from "../lib/utils";

export const BROWSER_ALLOW_LIST = [
	"mail.google.com",
	"in.indeed.com",
	"codeunnati.edunetfoundation.com",
	"app.notion.com",
	"gemini.google.com",
];

export const HOMEPAGE_ALLOW_LIST = [
	"youtube.com",
	"chatgpt.com",
	"claude.ai",
	"google.com",
];

export const BROWSER_DENY_LIST = [
	"in.pinterest.com",
	"reddit.com",
	"x.com",
	"linkedin.com",
];

export class BrowserMonitorGuard {
	private cache = new Map<string, { result: DecisionResult; expiry: number }>();
	private readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
	private client: DecisionClient;

	constructor(
		apiKey: string = process.env.API_KEY as string,
		endpoint: string = "https://app.vllm-sr.ai/v1/systemone",
		model: string = "vllm-sr/d3-flash",
	) {
		this.client = new DecisionClient(apiKey, endpoint, model);
	}

	async checkActivity(
		intent: string,
		title: string,
		url: string,
	): Promise<DecisionResult> {
		// 1. Tier 0: Domain fast paths
		const parsedUrl = new URL(url);
		if (
			BROWSER_ALLOW_LIST.some((domain) => parsedUrl.hostname.endsWith(domain))
		)
			return {
				isOffTask: false,
				alignment: "direct",
				confidence: 1.0,
				probDistracted: 0.0,
			};

		if (
			parsedUrl.pathname === "/" &&
			HOMEPAGE_ALLOW_LIST.some((domain) => parsedUrl.hostname.endsWith(domain))
		)
			return {
				isOffTask: false,
				alignment: "direct",
				confidence: 1.0,
				probDistracted: 0.0,
			};

		if (url.includes("newtab") || title === "New Tab")
			return {
				isOffTask: false,
				alignment: "direct",
				confidence: 1.0,
				probDistracted: 0.0,
			};

		if (BROWSER_DENY_LIST.some((domain) => url.toLowerCase().includes(domain)))
			return {
				isOffTask: true,
				alignment: "distraction",
				confidence: 1.0,
				probDistracted: 1.0,
			};

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
			expiry: Date.now() + this.CACHE_TTL_MS,
		});
		return result;
	}
}
