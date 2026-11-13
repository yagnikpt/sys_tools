export async function getMetaDescription(url: string): Promise<string | null> {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return null;
		}

		const response = await fetch(url, {
			signal: AbortSignal.timeout(3000),
			headers: {
				"User-Agent":
					"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
				Accept: "text/html,application/xhtml+xml",
			},
		});

		if (!response.ok) return null;

		const contentType = response.headers.get("content-type") || "";
		if (!contentType.includes("text/html") && !contentType.includes("xhtml")) {
			return null;
		}

		if (!response.body) return null;

		const reader = response.body.getReader();
		const chunks: Uint8Array[] = [];
		let totalBytes = 0;
		const MAX_BYTES = 64 * 1024;
		const decoder = new TextDecoder();

		while (totalBytes < MAX_BYTES) {
			const { done, value } = await reader.read();
			if (done || !value) break;
			chunks.push(value);
			totalBytes += value.length;

			const chunkStr = decoder.decode(value, { stream: true });
			if (chunkStr.toLowerCase().includes("</head>")) {
				break;
			}
		}
		reader.cancel().catch(() => {});

		const headHtml = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString(
			"utf-8",
		);

		let description: string | null = null;

		class MetaHandler {
			element(el: HTMLRewriterTypes.Element) {
				const name = el.getAttribute("name")?.toLowerCase();
				const property = el.getAttribute("property")?.toLowerCase();

				if (name === "description" || property === "og:description") {
					const content = el.getAttribute("content");
					if (content && !description) {
						description = content.trim();
					}
				}
			}
		}

		await new HTMLRewriter()
			.on("meta", new MetaHandler())
			.transform(new Response(headHtml))
			.text();

		return description;
	} catch {
		return null;
	}
}

export function processQueryParams(url: string) {
	const parsed = new URL(url);
	const searchParams = new URLSearchParams(parsed.search);
	const TRACKING_PARAMS = new Set([
		"utm_source",
		"utm_medium",
		"utm_campaign",
		"utm_term",
		"utm_content",
		"ref",
		"ref_src",
		"fbclid",
		"gclid",
		"si",
		"feature",
	]);
	for (const key of Array.from(searchParams.keys())) {
		if (key.startsWith("utm_") || TRACKING_PARAMS.has(key.toLowerCase())) {
			searchParams.delete(key);
		}
	}
	const searchStr = searchParams.toString();
	const cleanPath = parsed.pathname + (searchStr ? `?${searchStr}` : "");
	return cleanPath;
}
