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
		// Keep path and relevant search queries, drop tracking params (utm_*, ref, etc.)
		const searchParams = new URLSearchParams(parsed.search);
		const query = searchParams.get("q") || searchParams.get("query") || "";
		cleanPath =
			parsed.pathname + (query ? `?q=${encodeURIComponent(query)}` : "");
	} catch {
		cleanDomain = rawUrl;
	}

	// Strip common browser title suffixes (e.g. " - Google Chrome", " | Medium")
	const cleanTitle = title
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

export async function getMetaDescription(url: string): Promise<string | null> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
	}

	let description: string | null = null;

	class MetaHandler {
		element(el: HTMLRewriterTypes.Element) {
			const name = el.getAttribute("name");
			const property = el.getAttribute("property");

			// Check for <meta name="description"> or <meta property="og:description">
			if (name === "description" || property === "og:description") {
				const content = el.getAttribute("content");
				if (content) {
					description = content;
				}
			}
		}
	}

	// Use HTMLRewriter to inspect <meta> tags
	await new HTMLRewriter()
		.on("meta", new MetaHandler())
		.transform(response)
		.text(); // Consume the stream

	return description;
}
