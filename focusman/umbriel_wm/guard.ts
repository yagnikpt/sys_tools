import { DecisionClient, type DecisionResult } from "../lib/decision";
import { getAppDesktopInfo } from "../lib/desktop";
import {
	type DecisionPromptTemplate,
	formatStateFromApp,
	SYSTEM_APP_PROMPT_TEMPLATE,
} from "../lib/prompts";

export const SYSTEM_APP_ALLOW_LIST = [
	"antigravity",
	"dev.zed.Zed",
	"foot",
	"kitty",
	"org.gnome.Nautilus",
	"com.mitchellh.ghostty",
];

export const BROWSER_TO_IGNORE = ["helium"];

export const SYSTEM_APP_DENY_LIST = [
	"steam",
	"discord",
	"com.discordapp.Discord",
	"spotify",
	"com.spotify.Client",
	"lutris",
	"heroic",
	"vlc",
	"mpv",
	"telegram-desktop",
];

export class SystemAppGuard {
	private cache = new Map<string, { result: DecisionResult; expiry: number }>();
	private readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
	private client: DecisionClient;
	private promptTemplate: DecisionPromptTemplate;

	constructor(
		apiKey: string = process.env.API_KEY as string,
		endpoint: string = "https://app.vllm-sr.ai/v1/systemone",
		model: string = "vllm-sr/d3-flash",
		promptTemplate: DecisionPromptTemplate = SYSTEM_APP_PROMPT_TEMPLATE,
	) {
		this.client = new DecisionClient(apiKey, endpoint, model);
		this.promptTemplate = promptTemplate;
	}

	async checkActivity(
		intent: string,
		appId: string,
		title: string,
	): Promise<DecisionResult> {
		const lowerAppId = appId.toLowerCase();

		// Tier 0: Fast path allow list
		if (SYSTEM_APP_ALLOW_LIST.some((allowed) => lowerAppId.includes(allowed))) {
			return {
				isOffTask: false,
				alignment: "direct",
				confidence: 1.0,
				probDistracted: 0.0,
			};
		}

		// 2. Tier 0: Browser ignore list to let the browser module handle the tabs
		if (BROWSER_TO_IGNORE.some((ignored) => lowerAppId.includes(ignored))) {
			return {
				isOffTask: false,
				alignment: "direct",
				confidence: 1.0,
				probDistracted: 0.0,
			};
		}

		// Fast path deny list
		if (SYSTEM_APP_DENY_LIST.some((denied) => lowerAppId.includes(denied))) {
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

		const result = await this.client.evaluate(
			state,
			this.promptTemplate,
			`${appId} - ${title}`,
		);

		// Store in cache
		this.cache.set(cacheKey, {
			result,
			expiry: Date.now() + this.CACHE_TTL_MS,
		});

		return result;
	}
}
