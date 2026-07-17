import * as fs from "node:fs";
import { Container, getCapabilities, Image, Spacer, Text } from "@earendil-works/pi-tui";
import { APP_TITLE, getBundledInteractiveAssetPath } from "../../../config.ts";
import { theme } from "../theme/theme.ts";

const ICON_FILENAME = "all-for-one.png";

let cachedIconBase64: string | undefined;
let attemptedIconLoad = false;

function loadIconBase64(): string | undefined {
	if (attemptedIconLoad) {
		return cachedIconBase64;
	}

	attemptedIconLoad = true;
	try {
		cachedIconBase64 = fs.readFileSync(getBundledInteractiveAssetPath(ICON_FILENAME)).toString("base64");
	} catch {
		cachedIconBase64 = undefined;
	}
	return cachedIconBase64;
}

/** Compact product mark for terminals that support inline images, with a text fallback everywhere else. */
export class BrandHeaderComponent extends Container {
	constructor() {
		super();

		const iconBase64 = loadIconBase64();
		if (iconBase64 && getCapabilities().images) {
			this.addChild(
				new Image(
					iconBase64,
					"image/png",
					{ fallbackColor: (text) => theme.fg("muted", text) },
					{ maxWidthCells: 12, maxHeightCells: 6, filename: ICON_FILENAME },
				),
			);
			this.addChild(new Spacer(1));
		}

		this.addChild(new Text(theme.bold(theme.fg("accent", APP_TITLE)), 0, 0));
	}
}
