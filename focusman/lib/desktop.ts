import os from "node:os";
import path from "node:path";

export interface DesktopEntry {
	name?: string;
	genericName?: string;
	comment?: string;
	filePath: string;
}

const desktopCache = new Map<string, DesktopEntry | null>();

export function getDesktopSearchDirs(): string[] {
	const homedir = os.homedir();
	const dirs: string[] = [];

	// 1. User applications: $XDG_DATA_HOME/applications or ~/.local/share/applications
	const xdgDataHome = process.env.XDG_DATA_HOME;
	if (xdgDataHome) {
		dirs.push(path.join(xdgDataHome, "applications"));
	} else {
		dirs.push(path.join(homedir, ".local", "share", "applications"));
	}

	// 2. User Flatpak exports
	dirs.push(
		path.join(
			homedir,
			".local",
			"share",
			"flatpak",
			"exports",
			"share",
			"applications",
		),
	);

	// 3. $XDG_DATA_DIRS (colon-separated)
	const xdgDataDirs = process.env.XDG_DATA_DIRS;
	if (xdgDataDirs) {
		for (const dataDir of xdgDataDirs.split(":")) {
			const trimmed = dataDir.trim();
			if (trimmed) {
				dirs.push(path.join(trimmed, "applications"));
			}
		}
	}

	// 4. System Flatpak & standard distribution paths
	dirs.push(
		"/var/lib/flatpak/exports/share/applications",
		"/usr/local/share/applications",
		"/usr/share/applications",
	);

	// Deduplicate preserving priority order
	const seen = new Set<string>();
	const uniqueDirs: string[] = [];
	for (const dir of dirs) {
		const normalized = path.resolve(dir);
		if (!seen.has(normalized)) {
			seen.add(normalized);
			uniqueDirs.push(normalized);
		}
	}

	return uniqueDirs;
}

export async function findDesktopFilePath(
	appId: string,
): Promise<string | null> {
	if (!appId?.trim()) return null;

	const cleanId = appId.trim().replace(/\.desktop$/i, "");
	const searchDirs = getDesktopSearchDirs();

	// Candidates to check: exact cleanId, and lowercase variant if distinct
	const candidates = [`${cleanId}.desktop`];
	const lower = cleanId.toLowerCase();
	if (lower !== cleanId) {
		candidates.push(`${lower}.desktop`);
	}

	for (const dir of searchDirs) {
		for (const filename of candidates) {
			const candidatePath = path.join(dir, filename);
			if (await Bun.file(candidatePath).exists()) {
				return candidatePath;
			}
		}
	}

	return null;
}

export async function parseDesktopFile(
	filePath: string,
): Promise<DesktopEntry | null> {
	try {
		const file = Bun.file(filePath);
		if (!(await file.exists())) return null;

		const content = await file.text();
		const lines = content.split(/\r?\n/);

		let inDesktopEntrySection = false;
		let name: string | undefined;
		let genericName: string | undefined;
		let comment: string | undefined;

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;

			if (trimmed.startsWith("[")) {
				if (trimmed === "[Desktop Entry]") {
					inDesktopEntrySection = true;
				} else if (inDesktopEntrySection) {
					// Stop parsing once we leave [Desktop Entry]
					break;
				}
				continue;
			}

			if (!inDesktopEntrySection) continue;

			// Match exact unlocalized keys only
			if (!comment && trimmed.startsWith("Comment=")) {
				comment = trimmed.slice("Comment=".length).trim();
			} else if (!genericName && trimmed.startsWith("GenericName=")) {
				genericName = trimmed.slice("GenericName=".length).trim();
			} else if (!name && trimmed.startsWith("Name=")) {
				name = trimmed.slice("Name=".length).trim();
			}
		}

		return {
			name,
			genericName,
			comment,
			filePath,
		};
	} catch {
		return null;
	}
}

export async function getAppDesktopInfo(
	appId: string,
): Promise<DesktopEntry | null> {
	const key = appId.trim().toLowerCase();
	if (desktopCache.has(key)) {
		return desktopCache.get(key) ?? null;
	}

	const filePath = await findDesktopFilePath(appId);
	if (!filePath) {
		desktopCache.set(key, null);
		return null;
	}

	const entry = await parseDesktopFile(filePath);
	desktopCache.set(key, entry);
	return entry;
}
