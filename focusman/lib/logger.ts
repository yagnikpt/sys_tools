import pino from "pino";

const transport = pino.transport({
	targets: [
		{
			target: "pino/file",
			options: { destination: "./app.log", mkdir: true },
			level: "info",
		},
	],
});

export const logger = pino(transport);
