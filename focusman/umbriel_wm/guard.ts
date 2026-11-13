import {
	DEFAULT_CONFIG,
	type DecisionConfig,
	type SystemAppsConfig,
} from "../lib/config";
import { DecisionClient, type DecisionResult } from "../lib/decision";
import { getAppDesktopInfo } from "../lib/desktop";
import {
	type DecisionPromptTemplate,
	formatStateFromApp,
	SYSTEM_APP_PROMPT_TEMPLATE,
} from "../lib/prompts";

export class SystemAppGuard {
	private cache = new Map<string, { result: DecisionResult; expiry: number }>();
	private readonly cacheTtlMs: number;
	private client: DecisionClient;
	private promptTemplate: DecisionPromptTemplate;
	private allowList: string[];
	private ignoreBrowsers: string[];
	private denyList: string[];

	constructor(
		systemAppsConfig?: Partial<SystemAppsConfig>,
		decisionConfig?: Partial<DecisionConfig>,
		promptTemplate: DecisionPromptTemplate = SYSTEM_APP_PROMPT_TEMPLATE,
		client?: DecisionClient,
	) {
		this.allowList =
			systemAppsConfig?.allow_list ?? DEFAULT_CONFIG.system_apps.allow_list;
		this.ignoreBrowsers =
			systemAppsConfig?.ignore_browsers ??
			DEFAULT_CONFIG.system_apps.ignore_browsers;
		this.denyList =
			systemAppsConfig?.deny_list ?? DEFAULT_CONFIG.system_apps.deny_list;

		const ttlMinutes =
			decisionConfig?.cache_ttl_minutes ??
			DEFAULT_CONFIG.decision.cache_ttl_minutes;
		this.cacheTtlMs = ttlMinutes * 60 * 1000;

		const apiKey = decisionConfig?.api_key || (process.env.API_KEY as string);
		const endpoint =
			decisionConfig?.endpoint ?? DEFAULT_CONFIG.decision.endpoint;
		const model = decisionConfig?.model ?? DEFAULT_CONFIG.decision.model;

		this.client = client ?? new DecisionClient(apiKey, endpoint, model);
		this.promptTemplate = promptTemplate;
	}

	private setCache(key: string, result: DecisionResult): void {
		const now = Date.now();
		if (this.cache.size >= 500) {
			for (const [k, v] of this.cache.entries()) {
				if (now >= v.expiry) {
					this.cache.delete(k);
				}
			}
			if (this.cache.size >= 500) {
				const firstKey = this.cache.keys().next().value;
				if (firstKey) this.cache.delete(firstKey);
			}
		}
		this.cache.set(key, {
			result,
			expiry: now + this.cacheTtlMs,
		});
	}

	async checkActivity(
		intent: string,
		appId: string,
		title: string,
	): Promise<DecisionResult> {
		if (!intent?.trim()) {
			return {
				isOffTask: false,
				alignment: "direct",
				confidence: 1.0,
				probDistracted: 0.0,
			};
		}

		const lowerAppId = appId.toLowerCase();

		// Tier 0: Fast path allow list
		if (
			this.allowList.some((allowed) =>
				lowerAppId.includes(allowed.toLowerCase()),
			)
		) {
			return {
				isOffTask: false,
				alignment: "direct",
				confidence: 1.0,
				probDistracted: 0.0,
			};
		}

		// Tier 0: Browser ignore list to let the browser module handle the tabs
		if (
			this.ignoreBrowsers.some((ignored) =>
				lowerAppId.includes(ignored.toLowerCase()),
			)
		) {
			return {
				isOffTask: false,
				alignment: "direct",
				confidence: 1.0,
				probDistracted: 0.0,
			};
		}

		// Tier 0: Fast path deny list
		if (
			this.denyList.some((denied) => lowerAppId.includes(denied.toLowerCase()))
		) {
			return {
				isOffTask: true,
				alignment: "distraction",
				confidence: 1.0,
				probDistracted: 1.0,
			};
		}

		// Tier 1: Cache check
		const cacheKey = `${intent.toLowerCase()}::${lowerAppId}::${title.trim().toLowerCase()}`;
		const cached = this.cache.get(cacheKey);
		if (cached && Date.now() < cached.expiry) {
			return cached.result;
		}

		// Tier 2: Lookup .desktop file metadata and call DecisionClient
		const desktopInfo = await getAppDesktopInfo(appId);
		const state = formatStateFromApp(
			intent,
			appId,
			title,
			desktopInfo?.comment,
			desktopInfo?.genericName || desktopInfo?.name,
		);

		try {
			const result = await this.client.evaluate(
				state,
				this.promptTemplate,
				`${appId} - ${title}`,
			);

			this.setCache(cacheKey, result);
			return result;
		} catch (err) {
			console.error(`Decision evaluation failed for app ${appId}:`, err);
			return {
				isOffTask: false,
				alignment: "supporting",
				confidence: 0.0,
				probDistracted: 0.0,
			};
		}
	}
}
