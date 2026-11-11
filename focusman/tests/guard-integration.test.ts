import { afterEach, describe, expect, test } from "bun:test";
import type { Server, ServerWebSocket } from "bun";
import { closeTab, type IPCBrowserMessage, startBrowserMonitor } from "../browser/events";
import { BrowserMonitorGuard } from "../browser/guard";

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
				message() {},
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

describe("End-to-end multi-browser guard integration", () => {
	const serversToClean: MockCDPServer[] = [];

	afterEach(() => {
		for (const s of serversToClean) {
			s.close();
		}
		serversToClean.length = 0;
	});

	test("evaluates tabs from multiple ports and closes off-task tab on the correct port", async () => {
		const s1 = await createMockCDPServer();
		const s2 = await createMockCDPServer();
		serversToClean.push(s1, s2);

		const guard = new BrowserMonitorGuard({
			allow_list: ["allowed.com"],
			deny_list: ["distraction.com"],
		});

		const intent = "coding feature";

		const handle = startBrowserMonitor({
			ports: [s1.port, s2.port],
			debounceMs: 50,
			intervalMs: 1000,
			async onTabEvent(tab: IPCBrowserMessage) {
				const decision = await guard.checkActivity(intent, tab.title, tab.url);
				if (decision.isOffTask) {
					await closeTab(tab.targetId, tab.port);
				}
			},
		});

		await Bun.sleep(100);

		// Tab on s1 is allowed
		s1.sendToAll({
			method: "Target.targetCreated",
			params: {
				targetInfo: {
					targetId: "s1-allowed-tab",
					type: "page",
					title: "Docs",
					url: "https://allowed.com/guide",
				},
			},
		});

		// Tab on s2 is in deny_list (distraction)
		s2.sendToAll({
			method: "Target.targetCreated",
			params: {
				targetInfo: {
					targetId: "s2-distraction-tab",
					type: "page",
					title: "Social",
					url: "https://distraction.com/feed",
				},
			},
		});

		await Bun.sleep(150);

		// s1 should NOT have closed the allowed tab
		expect(s1.closedTabs).toEqual([]);

		// s2 MUST have closed the off-task tab
		expect(s2.closedTabs).toEqual(["s2-distraction-tab"]);

		handle.stop();
	});
});
