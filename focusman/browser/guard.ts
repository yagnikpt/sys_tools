import { logger } from "../lib/logger";
import { formatStateFromBrowser, getMetaDescription } from "../lib/utils";

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

interface DecisionResult {
	isOffTask: boolean;
	alignment: "direct" | "supporting" | "tangent" | "distraction";
	confidence: number;
	probDistracted: number;
}

export class BrowserMonitor {
	private cache = new Map<string, { result: DecisionResult; expiry: number }>();
	private readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

	constructor(
		private apiKey: string = process.env.API_KEY as string,
		private endpoint: string = "https://app.vllm-sr.ai/v1/systemone",
		private model: string = "vllm-sr/d3-flash",
	) {
		if (!process.env.API_KEY)
			throw new Error("API_KEY environment variable not set");
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
		const res = await fetch(this.endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify({
				model: this.model,
				state: formatStateFromBrowser(intent, title, desc, url),
				questions: {
					alignment: {
						type: "choice",
						instructions: "How does this tab relate to the declared intent?",
						criteria: {
							direct: "Directly advancing or reading for the stated intent.",
							supporting:
								"Required developer tool, search query, reference, or utility.",
							tangent:
								"Productive technical content but tangential to the goal.",
							distraction: "Entertainment, social media, shopping, or leisure.",
						},
					},
					is_off_task: {
						type: "noul",
						instructions:
							"Is this tab an off-task distraction away from the stated intent?",
						criteria: {
							true: "Unrelated entertainment, social media feed, casual shopping, or clear distraction.",
							false:
								"Directly relevant work, research, technical documentation, or necessary tool.",
						},
					},
				},
			}),
		});

		if (!res.ok) {
			throw new Error(`SystemOne error ${res.status}: ${await res.text()}`);
		}

		interface SystemOneResponse {
			answers: {
				alignment: {
					choice: "direct" | "supporting" | "tangent" | "distraction";
					confidence: number;
				};
				is_off_task: {
					noul: number;
				};
			};
		}

		const data = (await res.json()) as SystemOneResponse;
		const answers = data.answers;

		const result: DecisionResult = {
			alignment: answers.alignment.choice,
			confidence: answers.alignment.confidence,
			probDistracted: answers.is_off_task.noul,
			isOffTask:
				answers.is_off_task.noul >= 0.7 ||
				answers.alignment.choice === "distraction",
		};

		logger.info(result, title, url);

		// Store in cache
		this.cache.set(cacheKey, {
			result,
			expiry: Date.now() + this.CACHE_TTL_MS,
		});
		return result;
	}
}
