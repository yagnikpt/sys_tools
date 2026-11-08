interface TargetInfo {
	targetId: string;
	type: string;
	title: string;
	url: string;
	attached?: boolean;
}

interface CDPEvent {
	method?: string;
	params?: {
		targetInfo?: TargetInfo;
		targetId?: string;
	};
}

export interface IPCBrowserMessage {
	targetId: string;
	title: string;
	url: string;
}

const DEV_SERVER_PORT = 9222;
const INTERVAL_MS = 10000;
let shuttingDown = false;
let socket: WebSocket | null = null;

for (const sig of ["SIGTERM", "SIGINT"]) {
	process.on(sig, () => {
		console.log(`${sig} received`);
		shuttingDown = true;

		if (socket) {
			socket.close();
		}
	});
}

const tabsStore = new Map<string, TargetInfo>();

async function getBrowserWsUrl(port = DEV_SERVER_PORT): Promise<string> {
	const res = await fetch(`http://127.0.0.1:${port}/json/version`);
	if (!res.ok) {
		throw new Error(`Failed to fetch DevTools version: ${res.statusText}`);
	}
	const data = (await res.json()) as { webSocketDebuggerUrl?: string };
	if (!data.webSocketDebuggerUrl) {
		throw new Error(
			"webSocketDebuggerUrl not found. Is remote debugging enabled?",
		);
	}
	return data.webSocketDebuggerUrl;
}

async function closeTab(targetId: string) {
	try {
		await fetch(`http://127.0.0.1:${DEV_SERVER_PORT}/json/close/${targetId}`);
		// if (!res.ok) {
		// 	console.error(`Failed to close tab: ${res.statusText}`);
		// }
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`Failed to close tab: ${message}`);
	}
}

process.on("message", async (msg: { targetId: string }) => {
	// console.log("kill", msg.targetId);
	closeTab(msg.targetId);
});

async function listenToBrowser(): Promise<void> {
	const wsUrl = await getBrowserWsUrl();
	console.log(`Connecting to browser CDP: ${wsUrl}`);

	return new Promise((resolve) => {
		const ws = new WebSocket(wsUrl);
		socket = ws;

		ws.addEventListener("open", () => {
			console.log(" Connected to browser! Listening for tab events...\n");

			// Enable target discovery to stream tab lifecycle & change events
			ws.send(
				JSON.stringify({
					id: 1,
					method: "Target.setDiscoverTargets",
					params: { discover: true },
				}),
			);
		});

		ws.addEventListener("message", (event) => {
			const data: CDPEvent = JSON.parse(event.data.toString());

			if (!data.method) return;

			// 1. Tab Opened / Discovered
			if (data.method === "Target.targetCreated") {
				const info = data.params?.targetInfo;
				if (info?.type === "page" && info.url.startsWith("http")) {
					console.log(`[TAB OPENED] (id: ${info.targetId})`);
					console.log(`  Title: ${info.title || "(loading...)"}`);
					console.log(`  URL:   ${info.url}\n`);
					tabsStore.set(info.targetId, info);
					setTimeout(() => {
						if (tabsStore.has(info.targetId)) {
							process.send?.({
								type: "tabOpened",
								targetId: info.targetId,
								title: info.title,
								url: info.url,
							});
							tabsStore.delete(info.targetId);
						}
					}, 5000);
				}
			}

			// 2. Tab Navigation / Title / URL Changed
			else if (data.method === "Target.targetInfoChanged") {
				const info = data.params?.targetInfo;
				if (info?.type === "page" && info.url.startsWith("http")) {
					console.log(`[TAB CHANGED] (id: ${info.targetId})`);
					console.log(`  Title: ${info.title}`);
					console.log(`  URL:   ${info.url}\n`);
					process.send?.({
						type: "tabOpened",
						targetId: info.targetId,
						title: info.title,
						url: info.url,
					});
					if (tabsStore.has(info.targetId)) {
						tabsStore.delete(info.targetId);
					}
				}
			}

			// 3. Tab Closed
			// else if (data.method === "Target.targetDestroyed") {
			// 	if (data.params?.targetInfo?.type === "page") {
			// 		console.log(`[TAB CLOSED] (id: ${data.params?.targetId})\n`);
			// 		if (data.params?.targetId) {
			// 			tabsStore.delete(data.params.targetId);
			// 		}
			// 	}
			// }
		});

		ws.addEventListener("close", () => {
			console.log("Disconnected from browser.");
			if (socket === ws) {
				socket = null;
			}
			resolve();
		});

		ws.addEventListener("error", (err) => {
			console.error("WebSocket error:", err);
		});
	});
}

while (!shuttingDown) {
	try {
		await listenToBrowser();
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`failed: ${message}, retrying in ${INTERVAL_MS}ms`);
	}
	if (!shuttingDown) {
		await Bun.sleep(INTERVAL_MS);
	}
}
