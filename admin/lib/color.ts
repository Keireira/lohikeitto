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
 * Returns '#000000' or '#ffffff' for text that meets WCAG AA (4.5:1) contrast
 * against the given background hex color.
 */
const contrastText = (bgHex: string): string => {
	const [r, g, b] = hexToRgb(bgHex);
	const lum = luminance(r, g, b);
	return lum > 0.179 ? '#000000' : '#ffffff';
};

export { contrastText };
