export const GEMINI_INPUT_KEYS = {
	header: function GeminiHeader(api_key: string) {
		return {
			"x-goog-api-key": api_key,
		};
	},
	input: "input",
	noul_criteria_true: "true_description",
	noul_criteria_false: "false_description",
};

export const VLLM_SR_INPUT_KEYS = {
	header: function VLLMSRHeader(api_key: string) {
		return {
			Authorization: `Bearer ${api_key}`,
		};
	},
	input: "state",
	noul_criteria_true: "true",
	noul_criteria_false: "false",
};

type ProviderInputKeys = {
	header: (api_key: string) => Record<string, string>;
	input: string;
	noul_criteria_true: string;
	noul_criteria_false: string;
};

export const PROVIDERS = {
	gemini: GEMINI_INPUT_KEYS,
	vllm_sr: VLLM_SR_INPUT_KEYS,
} as Record<string, ProviderInputKeys>;
