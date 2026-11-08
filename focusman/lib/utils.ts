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

export * from "./desktop.ts";
