export const SESSION_RAIL_MIN_TERMINAL_WIDTH = 128;
export const SESSION_RAIL_MIN_WIDTH = 36;
export const SESSION_RAIL_MAX_WIDTH = 44;

export interface LayoutRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface VisibleLayoutRect extends LayoutRect {
	visible: boolean;
}

export interface ResponsiveLayoutInput {
	terminalWidth: number;
	terminalHeight: number;
	editorHeight: number;
	bottomAccessoryHeight?: number;
	footerHeight: number;
	railVisible?: boolean;
	railWidth?: number;
	overlayVisible?: boolean;
}

export interface ResponsiveLayout {
	terminal: {
		width: number;
		height: number;
	};
	transcript: LayoutRect;
	divider: LayoutRect;
	rail: VisibleLayoutRect;
	editor: LayoutRect;
	bottomAccessory: LayoutRect;
	footer: LayoutRect;
	overlay: LayoutRect | undefined;
	bottomHeight: number;
}

function nonNegativeInteger(value: number): number {
	return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function getRailWidth(width: number): number {
	return Math.max(SESSION_RAIL_MIN_WIDTH, Math.min(SESSION_RAIL_MAX_WIDTH, Math.floor(width / 5)));
}

export function getSessionRailLayout(width: number): {
	railVisible: boolean;
	railWidth: number;
	mainWidth: number;
} {
	const terminalWidth = nonNegativeInteger(width);
	if (terminalWidth < SESSION_RAIL_MIN_TERMINAL_WIDTH) {
		return { railVisible: false, railWidth: 0, mainWidth: terminalWidth };
	}

	const railWidth = getRailWidth(terminalWidth);
	return {
		railVisible: true,
		railWidth,
		mainWidth: terminalWidth - railWidth - 1,
	};
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}

export function calculateResponsiveLayout(input: ResponsiveLayoutInput): ResponsiveLayout {
	const terminalWidth = nonNegativeInteger(input.terminalWidth);
	const terminalHeight = nonNegativeInteger(input.terminalHeight);
	const editorHeight = nonNegativeInteger(input.editorHeight);
	const bottomAccessoryHeight = nonNegativeInteger(input.bottomAccessoryHeight ?? 0);
	const footerHeight = nonNegativeInteger(input.footerHeight);
	const railDefaults = getSessionRailLayout(terminalWidth);
	const requestedRailWidth = nonNegativeInteger(input.railWidth ?? railDefaults.railWidth);
	const railVisible = (input.railVisible ?? railDefaults.railVisible) && requestedRailWidth > 0 && terminalWidth > 1;
	const railWidth = railVisible ? clamp(requestedRailWidth, 1, Math.max(1, terminalWidth - 1)) : 0;
	const dividerWidth = railVisible ? 1 : 0;
	const transcriptWidth = Math.max(0, terminalWidth - railWidth - dividerWidth);
	const bottomHeight = editorHeight + bottomAccessoryHeight + footerHeight;
	const availableMainHeight = Math.max(0, terminalHeight - bottomHeight);
	const editorY = availableMainHeight;
	const accessoryY = editorY + editorHeight;
	const footerY = accessoryY + bottomAccessoryHeight;

	return {
		terminal: { width: terminalWidth, height: terminalHeight },
		transcript: { x: 0, y: 0, width: transcriptWidth, height: availableMainHeight },
		divider: { x: transcriptWidth, y: 0, width: dividerWidth, height: availableMainHeight },
		rail: {
			x: transcriptWidth + dividerWidth,
			y: 0,
			width: railWidth,
			height: availableMainHeight,
			visible: railVisible,
		},
		editor: { x: 0, y: editorY, width: terminalWidth, height: editorHeight },
		bottomAccessory: {
			x: 0,
			y: accessoryY,
			width: terminalWidth,
			height: bottomAccessoryHeight,
		},
		footer: { x: 0, y: footerY, width: terminalWidth, height: footerHeight },
		overlay: input.overlayVisible ? { x: 0, y: 0, width: terminalWidth, height: terminalHeight } : undefined,
		bottomHeight,
	};
}
