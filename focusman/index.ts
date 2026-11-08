import { parseArgs } from "node:util";
import { $ } from "bun";
import {
	closeTab,
	type IPCBrowserMessage,
	startBrowserMonitor,
} from "./browser/events.ts";
import { BrowserMonitorGuard } from "./browser/guard.ts";
import { loadConfig } from "./lib/config.ts";
import { logDev } from "./lib/logger.ts";
import {
	closeWindow,
	startUmbrielMonitor,
	type UmbrielWindowInfo,
} from "./umbriel_wm/events.ts";
import { SystemAppGuard } from "./umbriel_wm/guard.ts";

const { values } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		config: { type: "string", short: "c" },
		port: { type: "string", short: "p" },
		help: { type: "boolean", short: "h" },
	},
	strict: true,
	allowPositionals: true,
});

if (values.help) {
	console.log(`
Focusman - Wayland & Browser Focus Guard

Usage:
  focusman [options]

Options:
  -c, --config <path>   Path to custom config.toml file
  -p, --port <number>   Port to listen on (overrides config)
  -h, --help            Show this help message
`);
	process.exit(0);
}

function logShellError(err: $.ShellError) {
	logDev(`Command failed with code ${err.exitCode}`);
	if (err.stdout) logDev(err.stdout.toString());
	if (err.stderr) logDev(err.stderr.toString());
}

async function askIntent(
	promptCommand: string,
	currentIntent = "",
): Promise<string> {
	if (!promptCommand.trim()) return currentIntent;

	try {
		const out = await $`${{ raw: promptCommand }}`.text();
		return out.trim();
	} catch (err: unknown) {
		if (err instanceof $.ShellError) {
			logShellError(err);
		} else {
			logDev("Failed to prompt for intent:", err);
		}
		return currentIntent;
	}
}

async function main() {
	const { config, configPath } = await loadConfig(values.config);
	logDev(`Loaded configuration from: ${configPath}`);

	if (values.port) {
		const parsedPort = parseInt(values.port, 10);
		if (Number.isInteger(parsedPort) && parsedPort > 0) {
			config.server.port = parsedPort;
		}
	}

	let intent = config.intent.default_intent || "";

	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: config.server.port,
		idleTimeout: 25,
		routes: {
			"/status": () =>
				Response.json(
					{ status: "running", intent, port: config.server.port },
					{ status: 200 },
				),
			"/change-intent": async () => {
				intent = await askIntent(config.intent.prompt_command, intent);
				return Response.json(
					{ message: "Intent updated", intent },
					{ status: 200 },
				);
			},
		},

		fetch(_req) {
			return new Response("Not Found", { status: 404 });
		},
	});

	logDev(`Server running at ${server.url}`);

	if (!intent && config.intent.prompt_command) {
		intent = await askIntent(config.intent.prompt_command);
	}

	if (!intent) {
		logDev("No focus intent configured. Monitoring paused until intent is set.");
	}

	// 1. Browser tab monitor (CDP)
	let browserMonitor: { stop: () => void } | null = null;
	if (config.browser.enabled) {
		const bm = new BrowserMonitorGuard(config.browser, config.decision);
		browserMonitor = startBrowserMonitor({
			async onTabEvent(tab: IPCBrowserMessage) {
				if (!intent || !intent.trim()) return;
				const res = await bm.checkActivity(intent, tab.title, tab.url);
				if (res.isOffTask) {
					await closeTab(tab.targetId);
				}
			},
		});
	}

	// 2. Wayland system apps monitor (Umbriel compositor)
	let umbrielMonitor: { stop: () => void } | null = null;
	if (config.system_apps.enabled) {
		const systemAppGuard = new SystemAppGuard(
			config.system_apps,
			config.decision,
		);
		umbrielMonitor = startUmbrielMonitor({
			async onWindowFocus(win: UmbrielWindowInfo) {
				if (!intent || !intent.trim()) return;
				const res = await systemAppGuard.checkActivity(
					intent,
					win.app_id,
					win.title,
				);
				if (res.isOffTask) {
					await closeWindow(win.id);
				}
			},
		});
	}

	async function cleanup() {
		await server.stop();
		browserMonitor?.stop();
		umbrielMonitor?.stop();
	}

	process.on("SIGINT", async () => {
		await cleanup();
		process.exit(0);
	});

	process.on("SIGTERM", async () => {
		await cleanup();
		process.exit(0);
	});
}

main();
