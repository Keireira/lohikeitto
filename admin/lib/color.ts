/**
 * Parse hex color to RGB components.
 */
const hexToRgb = (hex: string): [number, number, number] => {
	const h = hex.replace('#', '');
	return [
		parseInt(h.slice(0, 2), 16),
		parseInt(h.slice(2, 4), 16),
		parseInt(h.slice(4, 6), 16)
	];
};

/**
 * Relative luminance per WCAG 2.1.
 */
const luminance = (r: number, g: number, b: number): number => {
	const [rs, gs, bs] = [r, g, b].map((c) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

/**
 * Contrast ratio between two luminances.
 */
const contrastRatio = (l1: number, l2: number): number => {
	const lighter = Math.max(l1, l2);
	const darker = Math.min(l1, l2);
	return (lighter + 0.05) / (darker + 0.05);
};

/**
 * Returns '#000000' or '#ffffff' — whichever has higher contrast
 * against the given background hex color.
 */
const contrastText = (bgHex: string): string => {
	const [r, g, b] = hexToRgb(bgHex);
	const lum = luminance(r, g, b);
	const blackContrast = contrastRatio(lum, 0);
	const whiteContrast = contrastRatio(1, lum);
	return whiteContrast >= blackContrast ? '#ffffff' : '#000000';
};

export { contrastText };
