import { afterEach, describe, expect, test } from "bun:test";
import type { Server, ServerWebSocket } from "bun";
import { closeTab, type IPCBrowserMessage, startBrowserMonitor } from "../browser/events";

interface MockCDPServer {
	server: Server<any>;
	port: number;
	activeSockets: ServerWebSocket<any>[];
	closedTabs: string[];
	sendToAll: (msg: object) => void;
	close: () => void;
}

function createMockCDPServer(): Promise<MockCDPServer> {
	return new Promise((resolve) => {
		const activeSockets: ServerWebSocket<any>[] = [];
		const closedTabs: string[] = [];

		const server = Bun.serve({
			port: 0,
			fetch(req, server) {
				const url = new URL(req.url);
				if (url.pathname === "/json/version") {
					return Response.json({
						webSocketDebuggerUrl: `ws://127.0.0.1:${server.port}/devtools/browser`,
					});
				}
				if (url.pathname.startsWith("/json/close/")) {
					const targetId = url.pathname.replace("/json/close/", "");
					closedTabs.push(targetId);
					return new Response("Target closed");
				}
				if (server.upgrade(req)) {
					return;
				}
				return new Response("Not Found", { status: 404 });
			},
			websocket: {
				open(ws) {
					activeSockets.push(ws);
				},
				message(ws, msg) {
					// Handle CDP messages if needed
				},
				close(ws) {
					const idx = activeSockets.indexOf(ws);
					if (idx !== -1) activeSockets.splice(idx, 1);
				},
			},
		});

		const mock: MockCDPServer = {
			server,
			port: server.port as number,
			activeSockets,
			closedTabs,
			sendToAll(msg: object) {
				const str = JSON.stringify(msg);
				for (const ws of activeSockets) {
					ws.send(str);
				}
			},
			close() {
				for (const ws of activeSockets) {
					ws.close();
				}
				server.stop(true);
			},
		};

		resolve(mock);
	});
}

describe("Browser Monitor - multi-port CDP", () => {
	const serversToClean: MockCDPServer[] = [];

	afterEach(() => {
		for (const s of serversToClean) {
			s.close();
		}
		serversToClean.length = 0;
	});

	test("listens to multiple ports and sends tab events with correct port", async () => {
		const s1 = await createMockCDPServer();
		const s2 = await createMockCDPServer();
		serversToClean.push(s1, s2);

		const receivedEvents: IPCBrowserMessage[] = [];

		const handle = startBrowserMonitor({
			ports: [s1.port, s2.port],
			debounceMs: 50,
			intervalMs: 1000,
			onTabEvent(tab) {
				receivedEvents.push(tab);
			},
		});

		// Wait for both connections to establish
		await Bun.sleep(100);
		expect(s1.activeSockets.length).toBe(1);
		expect(s2.activeSockets.length).toBe(1);

		// Emit tabCreated on server 1
		s1.sendToAll({
			method: "Target.targetCreated",
			params: {
				targetInfo: {
					targetId: "tab-1",
					type: "page",
					title: "GitHub",
					url: "https://github.com",
				},
			},
		});

		// Emit tabCreated on server 2
		s2.sendToAll({
			method: "Target.targetCreated",
			params: {
				targetInfo: {
					targetId: "tab-2",
					type: "page",
					title: "Reddit",
					url: "https://reddit.com",
				},
			},
		});

		// Wait for debounce (50ms) + processing
		await Bun.sleep(150);

		expect(receivedEvents.length).toBe(2);

		const event1 = receivedEvents.find((e) => e.targetId === "tab-1");
		const event2 = receivedEvents.find((e) => e.targetId === "tab-2");

		expect(event1).toBeDefined();
		expect(event1?.port).toBe(s1.port);
		expect(event1?.title).toBe("GitHub");

		expect(event2).toBeDefined();
		expect(event2?.port).toBe(s2.port);
		expect(event2?.title).toBe("Reddit");

		// Test closeTab with target port
		await closeTab("tab-2", s2.port);
		expect(s2.closedTabs).toContain("tab-2");
		expect(s1.closedTabs.length).toBe(0);

		handle.stop();
	});

	test("stop() cleanly closes all connections across ports", async () => {
		const s1 = await createMockCDPServer();
		const s2 = await createMockCDPServer();
		serversToClean.push(s1, s2);

		const handle = startBrowserMonitor({
			ports: [s1.port, s2.port],
			debounceMs: 50,
			intervalMs: 1000,
			onTabEvent() {},
		});

		await Bun.sleep(100);
		expect(s1.activeSockets.length).toBe(1);
		expect(s2.activeSockets.length).toBe(1);

		handle.stop();
		await Bun.sleep(100);

		expect(s1.activeSockets.length).toBe(0);
		expect(s2.activeSockets.length).toBe(0);
	});
});
