import fs from "node:fs";

export const isDev = process.env.NODE_ENV === "development";

export interface Logger {
	info(obj: unknown, msg?: string): void;
	error(obj: unknown, msg?: string): void;
	warn(obj: unknown, msg?: string): void;
	debug(obj: unknown, msg?: string): void;
}

const noopLogger: Logger = {
	info() {},
	error() {},
	warn() {},
	debug() {},
};

function writeLog(level: string, obj: unknown, msg?: string): void {
	if (!isDev) return;
	const entry = JSON.stringify({
		level,
		time: Date.now(),
		msg,
		...(typeof obj === "object" && obj !== null ? obj : { data: obj }),
	});
	try {
		fs.appendFileSync("./app.log", `${entry}\n`);
	} catch {
		console.log(`[${level}]`, msg ?? "", obj);
	}
}

export const logger: Logger = isDev
	? {
			info(obj, msg) {
				writeLog("info", obj, msg);
			},
			error(obj, msg) {
				writeLog("error", obj, msg);
			},
			warn(obj, msg) {
				writeLog("warn", obj, msg);
			},
			debug(obj, msg) {
				writeLog("debug", obj, msg);
			},
		}
	: noopLogger;

export function logDev(...args: unknown[]): void {
	if (isDev) {
		console.log(...args);
	}
}
