export function formatStateFromBrowser(
	intent: string,
	title: string,
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
		`[Relative Path]: ${cleanPath.slice(0, 150)}`
	);
}
