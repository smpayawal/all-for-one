import { readFileSync } from "fs";
import { APP_TITLE, getBundledInteractiveAssetPath } from "../../config.ts";

const APP_ICON_FILENAME = "all-for-one.png";

function getAppIconDataUri(): string {
	try {
		const iconBase64 = readFileSync(getBundledInteractiveAssetPath(APP_ICON_FILENAME)).toString("base64");
		return `data:image/png;base64,${iconBase64}`;
	} catch {
		return "";
	}
}

export function applyExportBranding(template: string): string {
	return template.replaceAll("{{APP_TITLE}}", APP_TITLE).replaceAll("{{APP_ICON_DATA_URI}}", getAppIconDataUri());
}
