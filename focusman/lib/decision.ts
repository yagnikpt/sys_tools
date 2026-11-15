import { logger } from "./logger";
import {
	type DecisionPromptTemplate,
	SYSTEM_APP_PROMPT_TEMPLATE,
} from "./prompts";
import { PROVIDERS } from "./provider_templates";

export interface DecisionResult {
	isOffTask: boolean;
	alignment: "direct" | "supporting" | "tangent" | "distraction";
	confidence: number;
	probDistracted: number;
}

interface SystemOneResponse {
	answers: {
		alignment: {
			choice: "direct" | "supporting" | "tangent" | "distraction";
			confidence: number;
		};
		is_off_task: {
			noul: number;
		};
	};
}

export class DecisionClient {
	constructor(
		private provider: string,
		private apiKey: string,
		private endpoint: string,
		private model: string,
	) {
		if (!this.apiKey) {
			throw new Error("API_KEY environment variable not set");
		}
	}

	async evaluate(
		state: string,
		template: DecisionPromptTemplate = SYSTEM_APP_PROMPT_TEMPLATE,
		logLabel?: string,
	): Promise<DecisionResult> {
		const res = await fetch(this.endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...PROVIDERS[this.provider]?.header(this.apiKey),
			},
			body: JSON.stringify({
				model: this.model,
				[PROVIDERS[this.provider]?.input ?? "input"]: state,
				questions: template(this.provider).questions,
			}),
		});

		if (!res.ok) {
			throw new Error(
				`DecisionClient error ${res.status}: ${await res.text()}`,
			);
		}

		const data = (await res.json()) as SystemOneResponse;
		const answers = data.answers;
		const isDistraction = answers.alignment.choice === "distraction";
		const probDistracted = answers.is_off_task.noul;
		const confidence = answers.alignment.confidence;
		const isOffTask =
			(probDistracted >= 0.75 &&
				answers.alignment.choice !== "direct" &&
				answers.alignment.choice !== "supporting") ||
			(isDistraction && confidence >= 0.65 && probDistracted >= 0.6);

		const result: DecisionResult = {
			alignment: answers.alignment.choice,
			confidence,
			probDistracted,
			isOffTask,
		};

		if (logLabel) {
			logger.info(result, logLabel);
		}

		return result;
	}
}
