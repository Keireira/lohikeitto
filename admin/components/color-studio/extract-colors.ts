import { hexToRgb, toHex } from '@/lib/color';

export const extractColors = (img: HTMLImageElement): string[] => {
	const canvas = document.createElement('canvas');
	const size = 64;
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d');
	if (!ctx) return [];
	ctx.drawImage(img, 0, 0, size, size);
	const data = ctx.getImageData(0, 0, size, size).data;

	const counts = new Map<string, number>();
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i],
			g = data[i + 1],
			b = data[i + 2],
			a = data[i + 3];
		if (a < 128) continue;
		const qr = Math.round(r / 32) * 32,
			qg = Math.round(g / 32) * 32,
			qb = Math.round(b / 32) * 32;
		const hex = toHex(qr, qg, qb);
		counts.set(hex, (counts.get(hex) ?? 0) + 1);
	}

	const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
	const results: string[] = [];
	if (sorted.length > 0) results.push(sorted[0][0]);

	let vibrant = '';
	let bestSat = 0;
	for (const [hex] of sorted.slice(0, 10)) {
		const [r2, g2, b2] = hexToRgb(hex);
		const max = Math.max(r2, g2, b2),
			min = Math.min(r2, g2, b2);
		const sat = max === 0 ? 0 : (max - min) / max;
		if (sat > bestSat) {
			bestSat = sat;
			vibrant = hex;
		}
	}
	if (vibrant && !results.includes(vibrant)) results.push(vibrant);

	const corners = [
		[0, 0],
		[size - 1, 0],
		[0, size - 1],
		[size - 1, size - 1]
	];
	let cr = 0,
		cg = 0,
		cb = 0;
	for (const [cx, cy] of corners) {
		const idx = (cy * size + cx) * 4;
		cr += data[idx];
		cg += data[idx + 1];
		cb += data[idx + 2];
	}
	const bgHex = toHex(Math.round(cr / 4), Math.round(cg / 4), Math.round(cb / 4));
	if (!results.includes(bgHex)) results.push(bgHex);

	return results.slice(0, 3);
};
