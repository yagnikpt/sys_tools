import { $ } from "bun";
import type { IPCBrowserMessage } from "./browser/events.ts";
import { BrowserMonitor } from "./browser/guard.ts";

function logShellError(err: $.ShellError) {
	console.log(`Failed with code ${err.exitCode}`);
	if (err.stdout) console.log(err.stdout.toString());
	if (err.stderr) console.log(err.stderr.toString());
}

async function main() {
	let intent = "";

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

	const browserMonitor = Bun.spawn(["bun", "browser/events.ts"], {
		async ipc(message: IPCBrowserMessage, childProc) {
			const bm = new BrowserMonitor();
			const res = await bm.checkActivity(intent, message.title, message.url);

			if (res.isOffTask) {
				childProc.send({
					targetId: message.targetId,
				});
			}
		},
		// stdout: "inherit",
	});

	async function cleanup() {
		await server.stop();
		browserMonitor.kill("SIGTERM");
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
