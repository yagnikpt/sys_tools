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

export const logger: Logger = isDev
	? (await import("pino")).default(
			(await import("pino")).default.destination({
				dest: "./app.log",
				mkdir: true,
				sync: true,
			}),
		)
	: noopLogger;

export function logDev(...args: unknown[]): void {
	if (isDev) {
		console.log(...args);
	}
}
