import { processQueryParams } from "../browser/utils";

export interface DecisionQuestionChoice {
	type: "choice";
	instructions: string;
	criteria: Record<string, string>;
}

export interface DecisionQuestionNoul {
	type: "noul";
	instructions: string;
	criteria: Record<string, string>;
}

export interface DecisionPromptTemplate {
	questions: {
		alignment: DecisionQuestionChoice;
		is_off_task: DecisionQuestionNoul;
	};
}

export const BROWSER_PROMPT_TEMPLATE: DecisionPromptTemplate = {
	questions: {
		alignment: {
			type: "choice",
			instructions: "How does this tab relate to the declared intent?",
			criteria: {
				direct: "Directly advancing or reading for the stated intent.",
				supporting:
					"Required developer tool, search query, reference, or utility.",
				tangent: "Productive technical content but tangential to the goal.",
				distraction: "Entertainment, social media, shopping, or leisure.",
			},
		},
		is_off_task: {
			type: "noul",
			instructions:
				"Is this tab an off-task distraction away from the stated intent?",
			criteria: {
				true: "Unrelated entertainment, social media feed, casual shopping, or clear distraction.",
				false:
					"Directly relevant work, research, technical documentation, or necessary tool.",
			},
		},
	},
};

export const SYSTEM_APP_PROMPT_TEMPLATE: DecisionPromptTemplate = {
	questions: {
		alignment: {
			type: "choice",
			instructions:
				"How does this system application / window relate to the user's declared intent?",
			criteria: {
				direct:
					"Directly advancing the stated intent (e.g. IDE, target document, active workspace).",
				supporting:
					"Required utility, terminal command, file manager, reference tool, or debugger.",
				tangent:
					"Productive or system configuration activity, but tangential to primary goal.",
				distraction:
					"Games, casual chatting, entertainment media, social apps, or leisure.",
			},
		},
		is_off_task: {
			type: "noul",
			instructions:
				"Is using this application an off-task distraction away from the user's declared intent?",
			criteria: {
				true: "Unrelated video game, casual social feed, media player for leisure, or clear distraction.",
				false:
					"Work-related tool, coding environment, terminal, document reader, or legitimate utility.",
			},
		},
	},
};

export function formatStateFromApp(
	intent: string,
	appId: string,
	title: string,
	comment?: string | null,
	genericName?: string | null,
): string {
	return (
		`[User Intent]: ${intent.trim()}\n` +
		`[Application ID]: ${appId.trim()}\n` +
		`[Window Title]: ${title.trim()}\n` +
		`[App Description / Comment]: ${comment || "None provided"}\n` +
		`[App Category / Generic Name]: ${genericName || "None provided"}`
	);
}

export function formatStateFromBrowser(
	intent: string,
	title: string,
	description: string | null,
	rawUrl: string,
): string {
	let cleanDomain = "";
	let cleanPath = "";

	try {
		const parsed = new URL(rawUrl);
		cleanDomain = parsed.hostname.replace(/^www\./, "");
		cleanPath = processQueryParams(rawUrl);
	} catch {
		cleanDomain = rawUrl;
	}

	const cleanTitle = title
		.replace(/^\(\d+\)\s*/, "")
		.replace(
			/\s*[-–|]\s*(Google Chrome|Mozilla Firefox|Brave|YouTube|Medium)$/i,
			"",
		)
		.trim();

	return (
		`[User Intent]: ${intent.trim()}\n` +
		`[Activity Domain]: ${cleanDomain}\n` +
		`[Page Title]: ${cleanTitle}\n` +
		`[Meta Description]: ${description || "No description found"}\n` +
		`[Relative Path]: ${cleanPath.slice(0, 150)}`
	);
}
