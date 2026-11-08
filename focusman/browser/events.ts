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

export type BrowserTabEvent = IPCBrowserMessage;

export interface BrowserMonitorOptions {
	port?: number;
	intervalMs?: number;
	onTabEvent: (tab: IPCBrowserMessage) => Promise<void> | void;
}

export interface BrowserMonitorHandle {
	stop: () => void;
}

const DEV_SERVER_PORT = 9222;
const INTERVAL_MS = 10000;

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

export async function closeTab(targetId: string, port = DEV_SERVER_PORT) {
	try {
		await fetch(`http://127.0.0.1:${port}/json/close/${targetId}`);
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`Failed to close tab: ${message}`);
	}
}

export function startBrowserMonitor(
	options: BrowserMonitorOptions,
): BrowserMonitorHandle {
	const port = options.port ?? DEV_SERVER_PORT;
	const intervalMs = options.intervalMs ?? INTERVAL_MS;

	let running = true;
	let socket: WebSocket | null = null;
	const tabsStore = new Map<string, TargetInfo>();
	const pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

	async function listenToBrowser(): Promise<void> {
		const wsUrl = await getBrowserWsUrl(port);
		console.log(`Connecting to browser CDP: ${wsUrl}`);

		return new Promise((resolve) => {
			if (!running) {
				resolve();
				return;
			}

			const ws = new WebSocket(wsUrl);
			socket = ws;

			ws.addEventListener("open", () => {
				console.log("Connected to browser! Listening for tab events...\n");

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
						// console.log(`[TAB OPENED] (id: ${info.targetId})`);
						// console.log(`  Title: ${info.title || "(loading...)"}`);
						// console.log(`  URL:   ${info.url}\n`);
						tabsStore.set(info.targetId, info);

						const existingTimer = pendingTimeouts.get(info.targetId);
						if (existingTimer) {
							clearTimeout(existingTimer);
						}

						const timer = setTimeout(() => {
							pendingTimeouts.delete(info.targetId);
							if (tabsStore.has(info.targetId)) {
								options.onTabEvent({
									targetId: info.targetId,
									title: info.title,
									url: info.url,
								});
								tabsStore.delete(info.targetId);
							}
						}, 5000);

						pendingTimeouts.set(info.targetId, timer);
					}
				}

				// 2. Tab Navigation / Title / URL Changed
				else if (data.method === "Target.targetInfoChanged") {
					const info = data.params?.targetInfo;
					if (info?.type === "page" && info.url.startsWith("http")) {
						// console.log(`[TAB CHANGED] (id: ${info.targetId})`);
						// console.log(`  Title: ${info.title}`);
						// console.log(`  URL:   ${info.url}\n`);

						const existingTimer = pendingTimeouts.get(info.targetId);
						if (existingTimer) {
							clearTimeout(existingTimer);
							pendingTimeouts.delete(info.targetId);
						}

						options.onTabEvent({
							targetId: info.targetId,
							title: info.title,
							url: info.url,
						});

						if (tabsStore.has(info.targetId)) {
							tabsStore.delete(info.targetId);
						}
					}
				}
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

	(async () => {
		while (running) {
			try {
				await listenToBrowser();
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				console.error(
					`Browser connection failed: ${message}, retrying in ${intervalMs}ms`,
				);
			}
			if (running) {
				await Bun.sleep(intervalMs);
			}
		}
	})();

	return {
		stop() {
			running = false;

			for (const timer of pendingTimeouts.values()) {
				clearTimeout(timer);
			}
			pendingTimeouts.clear();
			tabsStore.clear();

			if (socket) {
				socket.close();
				socket = null;
			}
		},
	};
}
