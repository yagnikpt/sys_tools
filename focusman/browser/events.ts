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
	port: number;
}

export type BrowserTabEvent = IPCBrowserMessage;

export interface BrowserMonitorOptions {
	ports?: number[];
	port?: number;
	intervalMs?: number;
	debounceMs?: number;
	onTabEvent: (tab: IPCBrowserMessage) => Promise<void> | void;
}

export interface BrowserMonitorHandle {
	stop: () => void;
}

const DEV_SERVER_PORT = 9222;
const INTERVAL_MS = 10000;
const DEBOUNCE_MS = 1000;

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
		console.error(`Failed to close tab on port ${port}: ${message}`);
	}
}

function startSingleBrowserMonitor(
	port: number,
	options: BrowserMonitorOptions,
): BrowserMonitorHandle {
	const intervalMs = options.intervalMs ?? INTERVAL_MS;
	const debounceMs = options.debounceMs ?? DEBOUNCE_MS;

	let running = true;
	let socket: WebSocket | null = null;
	const tabsStore = new Map<string, TargetInfo>();
	const pendingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

	function scheduleEvaluation(info: TargetInfo) {
		tabsStore.set(info.targetId, info);

		const existingTimer = pendingTimeouts.get(info.targetId);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		const timer = setTimeout(() => {
			pendingTimeouts.delete(info.targetId);
			const current = tabsStore.get(info.targetId);
			if (current) {
				options.onTabEvent({
					targetId: current.targetId,
					title: current.title,
					url: current.url,
					port,
				});
			}
		}, debounceMs);

		pendingTimeouts.set(info.targetId, timer);
	}

	async function listenToBrowser(): Promise<void> {
		const wsUrl = await getBrowserWsUrl(port);
		console.log(`[Port ${port}] Connecting to browser CDP: ${wsUrl}`);

		return new Promise((resolve) => {
			if (!running) {
				resolve();
				return;
			}

			const ws = new WebSocket(wsUrl);
			socket = ws;

			ws.addEventListener("open", () => {
				console.log(
					`[Port ${port}] Connected to browser! Listening for tab events...\n`,
				);

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
				let data: CDPEvent;
				try {
					data = JSON.parse(event.data.toString()) as CDPEvent;
				} catch {
					return;
				}

				if (!data.method) return;

				// 1. Tab Opened / Discovered or Changed
				if (
					data.method === "Target.targetCreated" ||
					data.method === "Target.targetInfoChanged"
				) {
					const info = data.params?.targetInfo;
					if (info?.type === "page" && info.url.startsWith("http")) {
						scheduleEvaluation(info);
					}
				}

				// 2. Tab Closed / Destroyed
				else if (data.method === "Target.targetDestroyed") {
					const targetId = data.params?.targetId;
					if (targetId) {
						const timer = pendingTimeouts.get(targetId);
						if (timer) {
							clearTimeout(timer);
							pendingTimeouts.delete(targetId);
						}
						tabsStore.delete(targetId);
					}
				}
			});

			ws.addEventListener("close", () => {
				console.log(`[Port ${port}] Disconnected from browser.`);
				if (socket === ws) {
					socket = null;
				}
				resolve();
			});

			ws.addEventListener("error", (err) => {
				console.error(`[Port ${port}] WebSocket error:`, err);
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
					`[Port ${port}] Browser connection failed: ${message}, retrying in ${intervalMs}ms`,
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

export function startBrowserMonitor(
	options: BrowserMonitorOptions,
): BrowserMonitorHandle {
	const ports =
		options.ports && options.ports.length > 0
			? options.ports
			: options.port !== undefined
				? [options.port]
				: [DEV_SERVER_PORT];

	const uniquePorts = Array.from(new Set(ports));
	const handles = uniquePorts.map((port) =>
		startSingleBrowserMonitor(port, options),
	);

	return {
		stop() {
			for (const handle of handles) {
				handle.stop();
			}
		},
	};
}
