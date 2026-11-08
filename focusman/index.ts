import { $ } from "bun";
import {
	closeTab,
	startBrowserMonitor,
	type IPCBrowserMessage,
} from "./browser/events.ts";
import { BrowserMonitorGuard } from "./browser/guard.ts";
import {
	closeWindow,
	startUmbrielMonitor,
	type UmbrielWindowInfo,
} from "./umbriel_wm/events.ts";
import { SystemAppGuard } from "./umbriel_wm/guard.ts";

function logShellError(err: $.ShellError) {
	console.log(`Failed with code ${err.exitCode}`);
	if (err.stdout) console.log(err.stdout.toString());
	if (err.stderr) console.log(err.stderr.toString());
}

async function main() {
	let intent = "";
	const bm = new BrowserMonitorGuard();
	const systemAppGuard = new SystemAppGuard();

	const server = Bun.serve({
		port: 49312,
		idleTimeout: 25,
		routes: {
			"/status": () =>
				Response.json({ status: "running", intent }, { status: 200 }),
			"/change-intent": async () => {
				try {
					intent =
						await $`rofi -dmenu -p "Intent: " -theme ~/.config/rofi/modules/input_only.rasi`.text();
				} catch (err: unknown) {
					if (err instanceof $.ShellError) logShellError(err);
				}
				return Response.json({ message: "Intent updated" }, { status: 200 });
			},
		},

		fetch(_req) {
			return new Response("Not Found", { status: 404 });
		},
	});

	console.log(`Server running at ${server.url}`);

	try {
		intent =
			await $`rofi -dmenu -p "Intent: " -theme ~/.config/rofi/modules/input_only.rasi`.text();
	} catch (err: unknown) {
		if (err instanceof $.ShellError) logShellError(err);
	}

	// 1. Browser tab monitor
	const browserMonitor = startBrowserMonitor({
		async onTabEvent(tab: IPCBrowserMessage) {
			const res = await bm.checkActivity(intent, tab.title, tab.url);

			if (res.isOffTask) {
				await closeTab(tab.targetId);
			}
		},
	});

	// 2. Wayland system apps monitor (Umbriel compositor)
	const umbrielMonitor = startUmbrielMonitor({
		async onWindowFocus(win: UmbrielWindowInfo) {
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

	async function cleanup() {
		await server.stop();
		browserMonitor.stop();
		umbrielMonitor.stop();
	}

	process.on("SIGINT", () => {
		cleanup();
		process.exit();
	});

	process.on("SIGTERM", () => {
		cleanup();
		process.exit();
	});
}

main();
