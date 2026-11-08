import { $ } from "bun";

export interface UmbrielWindowInfo {
	id: string;
	app_id: string;
	title: string;
	pid?: number;
	focused?: boolean;
	visible?: boolean;
	workspace?: string | number;
	floating?: boolean;
	fullscreen?: boolean;
	maximized?: boolean;
}

export interface UmbrielMonitorOptions {
	socketPath?: string;
	intervalMs?: number;
	debounceMs?: number;
	onWindowFocus: (win: UmbrielWindowInfo) => Promise<void> | void;
}

export interface UmbrielMonitorHandle {
	stop: () => void;
	closeWindow: (windowId: string) => Promise<void>;
}

function resolveUmbrielSocketPath(explicitPath?: string): string {
	if (explicitPath) return explicitPath;
	if (process.env.UMBRIEL_SOCKET) return process.env.UMBRIEL_SOCKET;

	const runtimeDir = process.env.XDG_RUNTIME_DIR || "/run/user/1000";
	const waylandDisplay = process.env.WAYLAND_DISPLAY || "wayland-0";
	return `${runtimeDir}/umbriel-${waylandDisplay}.sock`;
}

let activeSocket: Bun.Socket | null = null;

export async function closeWindow(
	windowId: string,
	socketPath?: string,
): Promise<void> {
	const actionPayload = `${JSON.stringify({
		cmd: "action",
		action: "window-close",
		window: windowId,
	})}\n`;

	// 1. If we have an active connected socket, write directly to it
	if (activeSocket) {
		try {
			activeSocket.write(actionPayload);
			return;
		} catch {
			// Fall through to other mechanisms if write fails
		}
	}

	// 2. Otherwise try connecting briefly to socket
	try {
		const targetSocketPath = resolveUmbrielSocketPath(socketPath);
		await Bun.connect({
			unix: targetSocketPath,
			socket: {
				open(sock) {
					sock.write(actionPayload);
					sock.end();
				},
				data() {},
				close() {},
				error(_sock, err) {
					console.error("Failed to close window via socket:", err);
				},
			},
		});
		return;
	} catch {
		// 3. Fallback to umbriel CLI if available
		try {
			await $`umbriel msg window-close ${windowId}`.quiet();
		} catch (err) {
			console.error(`Failed to close window ${windowId} via CLI:`, err);
		}
	}
}

export function startUmbrielMonitor(
	options: UmbrielMonitorOptions,
): UmbrielMonitorHandle {
	const socketPath = resolveUmbrielSocketPath(options.socketPath);
	const intervalMs = options.intervalMs ?? 5000;
	const debounceMs = options.debounceMs ?? 1000;

	let running = true;
	let currentSocket: Bun.Socket | null = null;
	let lastFocusedId: string | null = null;
	let lastFocusedTitle: string | null = null;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	async function listenToUmbriel(): Promise<void> {
		return new Promise((resolve) => {
			if (!running) {
				resolve();
				return;
			}

			console.log(`Connecting to Umbriel IPC socket: ${socketPath}`);
			let buffer = "";

			Bun.connect({
				unix: socketPath,
				socket: {
					open(sock) {
						console.log(
							"Connected to Umbriel! Subscribing to window events...\n",
						);
						currentSocket = sock;
						activeSocket = sock;

						// Subscribe to windows event stream
						const subscribeCmd = `${JSON.stringify({
							cmd: "subscribe",
							events: ["windows"],
						})}\n`;
						sock.write(subscribeCmd);
					},

					data(_sock, chunk) {
						buffer += chunk.toString();
						const lines = buffer.split("\n");
						buffer = lines.pop() ?? ""; // retain incomplete line in buffer

						for (const line of lines) {
							const trimmed = line.trim();
							if (!trimmed) continue;

							try {
								const event = JSON.parse(trimmed);
								if (event.event === "windows" && Array.isArray(event.data)) {
									const windows = event.data as UmbrielWindowInfo[];
									const focused = windows.find((w) => w.focused);

									if (!focused) continue;

									// Ignore if app_id is empty (e.g. desktop overlay or bar)
									if (!focused.app_id) continue;

									// Check if focus or title changed
									if (
										focused.id !== lastFocusedId ||
										focused.title !== lastFocusedTitle
									) {
										lastFocusedId = focused.id;
										lastFocusedTitle = focused.title;

										if (debounceTimer) {
											clearTimeout(debounceTimer);
										}

										debounceTimer = setTimeout(() => {
											options.onWindowFocus(focused);
										}, debounceMs);
									}
								}
							} catch (err) {
								console.error("Umbriel event JSON parse error:", err);
							}
						}
					},

					close(sock) {
						console.log("Disconnected from Umbriel IPC.");
						if (currentSocket === sock) {
							currentSocket = null;
						}
						if (activeSocket === sock) {
							activeSocket = null;
						}
						resolve();
					},

					error(_sock, err) {
						console.error("Umbriel socket error:", err);
					},
				},
			}).catch((err) => {
				console.error(`Umbriel connection error: ${err.message}`);
				resolve();
			});
		});
	}

	(async () => {
		while (running) {
			try {
				await listenToUmbriel();
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				console.error(
					`Umbriel loop error: ${message}, retrying in ${intervalMs}ms`,
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
			if (debounceTimer) {
				clearTimeout(debounceTimer);
				debounceTimer = null;
			}
			if (currentSocket) {
				try {
					currentSocket.end();
				} catch {}
				currentSocket = null;
			}
			if (activeSocket === currentSocket) {
				activeSocket = null;
			}
		},
		closeWindow,
	};
}
