import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface ServerConfig {
	port: number;
}

export interface IntentConfig {
	prompt_command: string;
	default_intent: string;
}

export interface DecisionConfig {
	endpoint: string;
	model: string;
	cache_ttl_minutes: number;
	api_key?: string;
}

export interface BrowserConfig {
	enabled: boolean;
	ports: number[];
	allow_list: string[];
	homepage_allow_list: string[];
	deny_list: string[];
}

export interface SystemAppsConfig {
	enabled: boolean;
	allow_list: string[];
	ignore_browsers: string[];
	deny_list: string[];
}

export interface FocusmanConfig {
	server: ServerConfig;
	intent: IntentConfig;
	decision: DecisionConfig;
	browser: BrowserConfig;
	system_apps: SystemAppsConfig;
}

export const DEFAULT_CONFIG: FocusmanConfig = {
	server: {
		port: 49312,
	},
	intent: {
		prompt_command:
			'rofi -dmenu -p "Intent: " -theme ~/.config/rofi/modules/input_only.rasi',
		default_intent: "",
	},
	decision: {
		endpoint: "https://app.vllm-sr.ai/v1/systemone",
		model: "vllm-sr/d3-flash",
		cache_ttl_minutes: 15,
		api_key: "",
	},
	browser: {
		enabled: true,
		ports: [9222],
		allow_list: ["mail.google.com", "app.notion.com", "gemini.google.com"],
		homepage_allow_list: [
			"youtube.com",
			"chatgpt.com",
			"claude.ai",
			"google.com",
		],
		deny_list: ["in.pinterest.com", "reddit.com", "x.com", "linkedin.com"],
	},
	system_apps: {
		enabled: true,
		allow_list: [
			"antigravity",
			"dev.zed.Zed",
			"foot",
			"kitty",
			"org.gnome.Nautilus",
			"com.mitchellh.ghostty",
		],
		ignore_browsers: ["helium"],
		deny_list: [
			"steam",
			"discord",
			"spotify",
			"lutris",
			"heroic",
			"vlc",
			"mpv",
		],
	},
};

export function serializeConfig(
	config: FocusmanConfig = DEFAULT_CONFIG,
): string {
	return `# Focusman Configuration File
# Location: ~/.config/focusman/config.toml

${Bun.TOML.stringify(config as unknown as Record<string, any>)}`;
}

export function getDefaultConfigPath(): string {
	const xdgConfigHome =
		process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
	return path.join(xdgConfigHome, "focusman", "config.toml");
}

function toStringArray(val: unknown, fallback: string[]): string[] {
	if (Array.isArray(val)) {
		return val.map((item) => String(item).trim()).filter(Boolean);
	}
	return [...fallback];
}

function toPortArray(val: unknown, fallback: number[]): number[] {
	const rawArray = Array.isArray(val) ? val : typeof val === "number" || typeof val === "string" ? [val] : [];
	const ports = rawArray
		.map((item) => Number(item))
		.filter((num) => Number.isInteger(num) && num > 0 && num <= 65535);

	return ports.length > 0 ? ports : [...fallback];
}

export function mergeConfig(
	parsed: Record<string, any>,
	defaults: FocusmanConfig = DEFAULT_CONFIG,
): FocusmanConfig {
	return {
		server: {
			port: Number(parsed.server?.port ?? defaults.server.port),
		},
		intent: {
			prompt_command: String(
				parsed.intent?.prompt_command ?? defaults.intent.prompt_command,
			),
			default_intent: String(
				parsed.intent?.default_intent ?? defaults.intent.default_intent,
			),
		},
		decision: {
			endpoint: String(parsed.decision?.endpoint ?? defaults.decision.endpoint),
			model: String(parsed.decision?.model ?? defaults.decision.model),
			cache_ttl_minutes: Number(
				parsed.decision?.cache_ttl_minutes ??
					defaults.decision.cache_ttl_minutes,
			),
			api_key: String(parsed.decision?.api_key ?? defaults.decision.api_key),
		},
		browser: {
			enabled: Boolean(parsed.browser?.enabled ?? defaults.browser.enabled),
			ports: toPortArray(
				parsed.browser?.ports ?? parsed.browser?.port,
				defaults.browser.ports,
			),
			allow_list: toStringArray(
				parsed.browser?.allow_list,
				defaults.browser.allow_list,
			),
			homepage_allow_list: toStringArray(
				parsed.browser?.homepage_allow_list,
				defaults.browser.homepage_allow_list,
			),
			deny_list: toStringArray(
				parsed.browser?.deny_list,
				defaults.browser.deny_list,
			),
		},
		system_apps: {
			enabled: Boolean(
				parsed.system_apps?.enabled ?? defaults.system_apps.enabled,
			),
			allow_list: toStringArray(
				parsed.system_apps?.allow_list,
				defaults.system_apps.allow_list,
			),
			ignore_browsers: toStringArray(
				parsed.system_apps?.ignore_browsers,
				defaults.system_apps.ignore_browsers,
			),
			deny_list: toStringArray(
				parsed.system_apps?.deny_list,
				defaults.system_apps.deny_list,
			),
		},
	};
}

export async function loadConfig(
	customPath?: string,
): Promise<{ config: FocusmanConfig; configPath: string }> {
	const configPath = customPath
		? path.resolve(customPath)
		: getDefaultConfigPath();
	const configFile = Bun.file(configPath);

	if (!(await configFile.exists())) {
		if (!customPath) {
			const dir = path.dirname(configPath);
			await fs.mkdir(dir, { recursive: true });
			await Bun.write(configPath, serializeConfig(DEFAULT_CONFIG));
			return { config: DEFAULT_CONFIG, configPath };
		}
		throw new Error(`Config file not found at: ${configPath}`);
	}

	try {
		const rawText = await configFile.text();
		const parsed = Bun.TOML.parse(rawText) as Record<string, any>;
		return { config: mergeConfig(parsed), configPath };
	} catch (err) {
		console.error(`Failed to parse TOML config file at ${configPath}:`, err);
		throw err;
	}
}
