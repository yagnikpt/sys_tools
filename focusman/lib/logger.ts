import pino from "pino";

export const logger = pino(
	{
		level: "info",
	},
	pino.destination({
		dest: "./app.log",
		mkdir: true,
		sync: false,
	}),
);
