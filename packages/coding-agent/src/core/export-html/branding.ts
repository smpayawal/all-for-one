import { readFileSync } from "fs";
import { APP_TITLE, getBundledInteractiveAssetPath } from "../../config.ts";

const APP_ICON_FILENAME = "all-for-one.png";

function getAppIconDataUri(): string | null {
	try {
		const iconBase64 = readFileSync(getBundledInteractiveAssetPath(APP_ICON_FILENAME)).toString("base64");
		return `data:image/png;base64,${iconBase64}`;
	} catch {
		return null;
	}
}

export function applyExportBranding(
	template: string,
	iconDataUri: string | null = getAppIconDataUri(),
): string {
	const favicon = iconDataUri ? `<link rel="icon" type="image/png" href="${iconDataUri}">` : "";
	const brandIcon = iconDataUri ? `<img class="brand-icon" src="${iconDataUri}" alt="">` : "";

	return template
		.replaceAll("{{APP_TITLE}}", APP_TITLE)
		.replaceAll("{{APP_FAVICON}}", favicon)
		.replaceAll("{{APP_BRAND_ICON}}", brandIcon);
}
