const hexToRgb = (hex: string): [number, number, number] => {
	const h = hex.replace('#', '');
	return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

const luminance = (r: number, g: number, b: number): number => {
	const [rs, gs, bs] = [r, g, b].map((c) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	});
	return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

const contrastRatio = (l1: number, l2: number): number => {
	const lighter = Math.max(l1, l2);
	const darker = Math.min(l1, l2);
	return (lighter + 0.05) / (darker + 0.05);
};

const contrastText = (bgHex: string): string => {
	const [r, g, b] = hexToRgb(bgHex);
	const lum = luminance(r, g, b);
	const blackContrast = contrastRatio(lum, 0);
	const whiteContrast = contrastRatio(1, lum);
	return whiteContrast >= blackContrast ? '#ffffff' : '#000000';
};

const toHex = (r: number, g: number, b: number): string =>
	`#${[r, g, b]
		.map((v) =>
			Math.min(255, Math.max(0, Math.round(v)))
				.toString(16)
				.padStart(2, '0')
		)
		.join('')}`;

const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b),
		min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	let h = 0;
	if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
	else if (max === g) h = ((b - r) / d + 2) / 6;
	else h = ((r - g) / d + 4) / 6;
	return [h * 360, s * 100, l * 100];
};

const rgbToOklch = (r: number, g: number, b: number): [number, number, number] => {
	const lin = (v: number) => {
		v /= 255;
		return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	const lr = lin(r),
		lg = lin(g),
		lb = lin(b);
	const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
	const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
	const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
	const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
	const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
	const ob = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
	const C = Math.sqrt(a * a + ob * ob);
	let H = (Math.atan2(ob, a) * 180) / Math.PI;
	if (H < 0) H += 360;
	return [L, C, H];
};

const parseColor = (input: string): string | null => {
	const s = input
		.trim()
		.replace(/;+$/, '')
		.replace(/,\s*\)/, ')')
		.replace(/^(?:background(?:-color)?|color)\s*:\s*/i, '')
		.trim();
	const hex6 = s.match(/^#?([0-9a-fA-F]{6})$/);
	if (hex6) return `#${hex6[1].toLowerCase()}`;
	const hex3 = s.match(/^#?([0-9a-fA-F]{3})$/);
	if (hex3) {
		const h = hex3[1];
		return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
	}
	const rgbMatch = s.match(/^(?:rgba?\s*\(\s*)?(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*(?:\)?)$/i);
	if (rgbMatch) return toHex(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]));
	const hslMatch = s.match(/^hsla?\s*\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)%?\s*[,\s]\s*([\d.]+)%?\s*(?:\)?)$/i);
	if (hslMatch) {
		const h = Number(hslMatch[1]) / 360,
			sat = Number(hslMatch[2]) / 100,
			l = Number(hslMatch[3]) / 100;
		const hue2rgb = (p: number, q: number, t: number) => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		};
		const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat,
			p = 2 * l - q;
		return toHex(
			Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
			Math.round(hue2rgb(p, q, h) * 255),
			Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
		);
	}
	const srgbMatch = s.match(/^color\s*\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:[/]\s*[\d.]+\s*)?\)$/i);
	if (srgbMatch)
		return toHex(
			Math.round(Number(srgbMatch[1]) * 255),
			Math.round(Number(srgbMatch[2]) * 255),
			Math.round(Number(srgbMatch[3]) * 255)
		);
	const cssColorMatch = s.match(/^(?:oklch|oklab|color|lab|lch)\s*\(/i);
	if (cssColorMatch && typeof document !== 'undefined') {
		const cv = document.createElement('canvas');
		cv.width = 1;
		cv.height = 1;
		const cx = cv.getContext('2d', { colorSpace: 'srgb' });
		if (cx) {
			cx.fillStyle = s;
			cx.fillRect(0, 0, 1, 1);
			const [cr, cg, cb] = cx.getImageData(0, 0, 1, 1).data;
			return toHex(cr, cg, cb);
		}
	}
	return null;
};

export { contrastText, hexToRgb, parseColor, rgbToHsl, rgbToOklch, toHex };
