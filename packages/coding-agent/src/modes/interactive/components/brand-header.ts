import { Container } from "@earendil-works/pi-tui";

/**
 * The interactive application shell keeps product identity in the persistent
 * session rail and terminal title. Keeping the transcript header empty avoids
 * repeating the product name above every session while preserving the custom
 * header extension point and component contract.
 */
export class BrandHeaderComponent extends Container {}
