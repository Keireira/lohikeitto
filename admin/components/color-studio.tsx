'use client';

import { useEffect, useRef, useState } from 'react';
import { contrastText, hexToRgb } from '@/lib/color';
import { toast } from '@/lib/toast';

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
	// sRGB → linear
	const lin = (v: number) => {
		v /= 255;
		return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	const lr = lin(r),
		lg = lin(g),
		lb = lin(b);
	// Linear → OKLab
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
	// #XXXXXX or XXXXXX (6 hex digits)
	const hex6 = s.match(/^#?([0-9a-fA-F]{6})$/);
	if (hex6) return `#${hex6[1].toLowerCase()}`;
	// #XXX or XXX (3 hex digits)
	const hex3 = s.match(/^#?([0-9a-fA-F]{3})$/);
	if (hex3) {
		const h = hex3[1];
		return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toLowerCase();
	}
	// rgb(R, G, B) or R, G, B or R G B
	const rgbMatch = s.match(/^(?:rgba?\s*\(\s*)?(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*[,\s]\s*(\d{1,3})\s*(?:\)?)$/i);
	if (rgbMatch) return toHex(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]));
	// hsl(H, S%, L%)
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
	// color(srgb R G B) — values 0-1
	const srgbMatch = s.match(/^color\s*\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:[/]\s*[\d.]+\s*)?\)$/i);
	if (srgbMatch)
		return toHex(
			Math.round(Number(srgbMatch[1]) * 255),
			Math.round(Number(srgbMatch[2]) * 255),
			Math.round(Number(srgbMatch[3]) * 255)
		);
	// oklch, oklab, color(), lab, lch — render to canvas to get sRGB
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

type Sample = { color: string; x: number; y: number; excluded: boolean };

type Props = {
	color: string;
	originalColor: string;
	logoUrl: string;
	logoOk: boolean;
	name: string;
	onChange: (hex: string) => void;
	onClose: () => void;
};

const FormatRow = ({ label, value }: { label: string; value: string }) => (
	<div className="flex items-center gap-3 py-1">
		<span className="text-[10px] text-muted-fg w-12 shrink-0 uppercase font-bold tracking-wider">{label}</span>
		<span className="text-sm font-mono text-foreground flex-1 truncate">{value}</span>
		<button
			type="button"
			onClick={() => {
				navigator.clipboard.writeText(value);
				toast.success(`${label} copied`);
			}}
			className="text-[11px] text-muted-fg hover:text-accent cursor-pointer shrink-0"
		>
			Copy
		</button>
	</div>
);

const ColorStudio = ({ color, originalColor, logoUrl, logoOk, name, onChange, onClose }: Props) => {
	const [samples, setSamples] = useState<Sample[]>([]);
	const [colorInput, setColorInput] = useState(color);
	const [zoom, setZoom] = useState(1);
	const [isPanning, setIsPanning] = useState(false);
	const [draggingSample, setDraggingSample] = useState<number | null>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const zoomRef = useRef<HTMLDivElement>(null);
	const panStart = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);

	// Sync input when color changes externally
	useEffect(() => {
		setColorInput(color);
	}, [color]);

	// Color representations
	const [r, g, b] = hexToRgb(color);
	const [h, s, l] = rgbToHsl(r, g, b);
	const [okL, okC, okH] = rgbToOklch(r, g, b);

	const hexStr = color;
	const rgbStr = `rgb(${r}, ${g}, ${b})`;
	const hslStr = `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
	const oklchStr = `oklch(${okL.toFixed(3)} ${okC.toFixed(3)} ${Math.round(okH)})`;

	// Draw canvas
	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(logoUrl);
				if (!res.ok) return;
				const blob = await res.blob();
				const url = URL.createObjectURL(blob);
				const img = new Image();
				img.onload = () => {
					if (cancelled) {
						URL.revokeObjectURL(url);
						return;
					}
					const size = canvas.width;
					const ctx = canvas.getContext('2d');
					if (!ctx) return;
					// Checkerboard
					ctx.fillStyle = '#fff';
					ctx.fillRect(0, 0, size, size);
					for (let y = 0; y < size; y += 8)
						for (let x = 0; x < size; x += 8)
							if ((x / 8 + y / 8) % 2 === 0) {
								ctx.fillStyle = '#e5e5e5';
								ctx.fillRect(x, y, 8, 8);
							}
					// Image centered
					const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
					const w = img.naturalWidth * scale,
						h = img.naturalHeight * scale;
					ctx.drawImage(img, Math.round((size - w) / 2), Math.round((size - h) / 2), Math.round(w), Math.round(h));
					URL.revokeObjectURL(url);
				};
				img.src = url;
			} catch {
				/* */
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [logoUrl]);

	// Sample from canvas click
	const sampleAt = (clientX: number, clientY: number): string | null => {
		const canvas = canvasRef.current;
		if (!canvas) return null;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		const rect = canvas.getBoundingClientRect();
		const cx = Math.floor((clientX - rect.left) * (canvas.width / rect.width));
		const cy = Math.floor((clientY - rect.top) * (canvas.height / rect.height));
		if (cx < 0 || cy < 0 || cx >= canvas.width || cy >= canvas.height) return null;
		const [sr, sg, sb] = ctx.getImageData(cx, cy, 1, 1).data;
		return toHex(sr, sg, sb);
	};

	// Canvas-relative coords (0-1)
	const clientToNorm = (clientX: number, clientY: number): { nx: number; ny: number } | null => {
		const canvas = canvasRef.current;
		if (!canvas) return null;
		const rect = canvas.getBoundingClientRect();
		return { nx: (clientX - rect.left) / rect.width, ny: (clientY - rect.top) / rect.height };
	};

	const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
		if (isPanning) return;
		const c = sampleAt(e.clientX, e.clientY);
		const pos = clientToNorm(e.clientX, e.clientY);
		if (c && pos) {
			setSamples((prev) => [...prev, { color: c, x: pos.nx, y: pos.ny, excluded: false }]);
		}
	};

	// Auto-apply average
	const included = samples.filter((s) => !s.excluded);
	useEffect(() => {
		if (included.length === 0) return;
		let tr = 0,
			tg = 0,
			tb = 0;
		for (const s of included) {
			const [sr, sg, sb] = hexToRgb(s.color);
			tr += sr;
			tg += sg;
			tb += sb;
		}
		const n = included.length;
		onChange(toHex(Math.round(tr / n), Math.round(tg / n), Math.round(tb / n)));
	}, [included.length, samples]);

	// Drag sample dots
	const handleDotDrag = (e: React.MouseEvent) => {
		if (draggingSample === null) return;
		const c = sampleAt(e.clientX, e.clientY);
		const pos = clientToNorm(e.clientX, e.clientY);
		if (c && pos) {
			setSamples((prev) => prev.map((s, i) => (i === draggingSample ? { ...s, color: c, x: pos.nx, y: pos.ny } : s)));
		}
	};

	// Zoom wheel
	useEffect(() => {
		const el = zoomRef.current;
		if (!el) return;
		const handler = (e: WheelEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setZoom((z) => Math.min(8, Math.max(1, z + (e.deltaY > 0 ? -0.25 : 0.25))));
		};
		el.addEventListener('wheel', handler, { passive: false });
		return () => el.removeEventListener('wheel', handler);
	}, []);

	// Pan keys
	useEffect(() => {
		const keys = new Set(['Space', 'MetaLeft', 'MetaRight', 'ControlLeft', 'ControlRight']);
		const down = (e: KeyboardEvent) => {
			if (keys.has(e.code)) {
				e.preventDefault();
				setIsPanning(true);
			}
		};
		const up = (e: KeyboardEvent) => {
			if (keys.has(e.code)) {
				setIsPanning(false);
				panStart.current = null;
			}
		};
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);
		return () => {
			window.removeEventListener('keydown', down);
			window.removeEventListener('keyup', up);
		};
	}, []);

	// ESC
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				e.stopImmediatePropagation();
				onClose();
			}
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [onClose]);

	const handlePanStart = (e: React.MouseEvent) => {
		if (!isPanning && e.button !== 1) return;
		e.preventDefault();
		const el = zoomRef.current;
		if (!el) return;
		panStart.current = { x: e.clientX, y: e.clientY, sx: el.scrollLeft, sy: el.scrollTop };
	};
	const handlePanMove = (e: React.MouseEvent) => {
		if (draggingSample !== null) {
			handleDotDrag(e);
			return;
		}
		if (!panStart.current) return;
		const el = zoomRef.current;
		if (!el) return;
		el.scrollLeft = panStart.current.sx - (e.clientX - panStart.current.x);
		el.scrollTop = panStart.current.sy - (e.clientY - panStart.current.y);
	};
	const handlePanEnd = () => {
		panStart.current = null;
		setDraggingSample(null);
	};

	const handleInputChange = (val: string) => {
		setColorInput(val);
		const parsed = parseColor(val);
		if (parsed) onChange(parsed);
	};

	const handlePaste = (e: React.ClipboardEvent) => {
		const text = e.clipboardData.getData('text');
		const parsed = parseColor(text);
		if (parsed) {
			e.preventDefault();
			onChange(parsed);
			setColorInput(parsed);
		}
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			onClick={onClose}
			onWheel={(e) => e.preventDefault()}
		>
			<div
				className="bg-surface rounded-2xl border border-border shadow-2xl w-[1100px] max-w-[95vw] h-[85vh] overflow-hidden flex"
				onClick={(e) => e.stopPropagation()}
				onWheel={(e) => e.stopPropagation()}
			>
				{/* Left: preview + canvas */}
				<div className="flex-[2] shrink-0 flex flex-col border-r border-border">
					{/* Color preview */}
					<div
						className="min-h-28 py-6 flex items-center justify-center shrink-0 transition-colors"
						style={{ backgroundColor: color }}
					>
						{logoOk ? (
							<img src={logoUrl} alt="" className="h-16 object-contain" />
						) : (
							<span className="text-4xl font-bold" style={{ color: contrastText(color) }}>
								{name.charAt(0).toUpperCase()}
							</span>
						)}
					</div>

					{/* Canvas */}
					<div className="flex-1 flex flex-col min-h-0">
						<div
							ref={zoomRef}
							className={`flex-1 overflow-auto p-3 relative select-none ${isPanning ? 'cursor-grab active:cursor-grabbing' : ''}`}
							onMouseDown={handlePanStart}
							onMouseMove={handlePanMove}
							onMouseUp={handlePanEnd}
							onMouseLeave={handlePanEnd}
						>
							<div
								className="relative rounded-xl overflow-hidden border border-border"
								style={{ width: zoom === 1 ? '100%' : `${zoom * 100}%`, touchAction: 'none' }}
							>
								<canvas
									ref={canvasRef}
									width={512}
									height={512}
									onClick={handleCanvasClick}
									className="w-full h-auto cursor-crosshair"
								/>
								{/* Sample loupe dots */}
								{samples.map((dot, i) => {
									const active = draggingSample === i;
									const sz = active ? 56 : 40;
									const mag = 6;
									return (
										<div
											key={i}
											className={`absolute -translate-x-1/2 cursor-grab transition-all ${dot.excluded ? 'opacity-40' : ''} ${active ? 'z-10' : 'z-[5]'}`}
											style={{
												left: `${dot.x * 100}%`,
												top: `${dot.y * 100}%`,
												transform: `translate(-50%, -${sz + 18}px)`
											}}
											onMouseDown={(e) => {
												e.stopPropagation();
												e.preventDefault();
												setDraggingSample(i);
											}}
											onClick={(e) => {
												e.stopPropagation();
												setSamples((prev) => prev.map((s, j) => (j === i ? { ...s, excluded: !s.excluded } : s)));
											}}
											onContextMenu={(e) => {
												e.preventDefault();
												e.stopPropagation();
												setSamples((prev) => prev.filter((_, j) => j !== i));
											}}
										>
											{/* Hex label above */}
											<div className="text-[9px] font-mono text-center mb-1 text-foreground bg-surface/80 rounded px-1.5 py-0.5 backdrop-blur-sm mx-auto w-fit shadow-sm">
												{dot.color}
											</div>
											{/* Loupe circle */}
											<div
												className="rounded-full overflow-hidden shadow-xl mx-auto"
												style={{
													width: sz,
													height: sz,
													border: `3px solid ${dot.color}`,
													backgroundImage: canvasRef.current ? `url(${canvasRef.current.toDataURL()})` : undefined,
													backgroundSize: `${512 * mag}px ${512 * mag}px`,
													backgroundPosition: `${-dot.x * 512 * mag + sz / 2}px ${-dot.y * 512 * mag + sz / 2}px`,
													imageRendering: 'pixelated'
												}}
											>
												<div className="size-full relative">
													<div className="absolute left-1/2 top-0 bottom-0 w-px bg-black/20" />
													<div className="absolute top-1/2 left-0 right-0 h-px bg-black/20" />
												</div>
											</div>
											{/* Pointer line down to sample point */}
											<div className="w-px h-3 bg-foreground/30 mx-auto" />
											<div className="size-1.5 rounded-full mx-auto" style={{ backgroundColor: dot.color }} />
										</div>
									);
								})}
							</div>

							{/* Zoom controls */}
							<div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-surface/90 border border-border shadow-lg px-2 py-1 backdrop-blur-sm">
								<button
									type="button"
									onClick={() => setZoom((z) => Math.max(1, z - 0.5))}
									disabled={zoom <= 1}
									className="size-6 rounded-full flex items-center justify-center text-xs text-muted-fg hover:text-foreground cursor-pointer disabled:opacity-30"
								>
									{'−'}
								</button>
								<span className="text-[10px] text-muted-fg w-10 text-center font-mono">
									{zoom === 1 ? 'Fit' : `${zoom.toFixed(1)}x`}
								</span>
								<button
									type="button"
									onClick={() => setZoom((z) => Math.min(8, z + 0.5))}
									disabled={zoom >= 8}
									className="size-6 rounded-full flex items-center justify-center text-xs text-muted-fg hover:text-foreground cursor-pointer disabled:opacity-30"
								>
									{'+'}
								</button>
								{zoom > 1 && (
									<button
										type="button"
										onClick={() => setZoom(1)}
										className="text-[10px] text-muted-fg hover:text-foreground cursor-pointer ml-1"
									>
										Reset
									</button>
								)}
							</div>
						</div>
					</div>
				</div>

				{/* Right: controls */}
				<div className="flex-1 flex flex-col min-w-[340px] bg-background">
					{/* Header */}
					<div className="px-8 pt-6 pb-5 border-b border-border shrink-0">
						<p className="text-[11px] font-bold text-accent uppercase tracking-widest">Color Studio</p>
						<div className="flex items-center justify-between mt-1.5">
							<h3 className="text-lg font-bold text-foreground">Brand Color</h3>
							<button
								type="button"
								onClick={onClose}
								className="size-8 rounded-lg flex items-center justify-center text-muted-fg hover:text-foreground hover:bg-muted cursor-pointer transition-colors text-xl"
							>
								{'×'}
							</button>
						</div>
					</div>

					<div className="flex-1 overflow-y-auto px-8 py-7 space-y-8">
						{/* Manual picker */}
						<div>
							<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-4">Manual</p>
							<div className="flex items-center gap-4">
								<label className="relative size-12 rounded-full overflow-hidden cursor-pointer shrink-0 border border-border">
									<input
										type="color"
										value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#000000'}
										onChange={(e) => onChange(e.target.value)}
										className="absolute inset-[-8px] w-[calc(100%+16px)] h-[calc(100%+16px)] cursor-pointer border-0 p-0"
									/>
								</label>
								<input
									value={colorInput}
									onChange={(e) => handleInputChange(e.target.value)}
									onPaste={handlePaste}
									placeholder="#000000 or rgb(...) or hsl(...)"
									className="flex-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-accent/50"
								/>
							</div>
						</div>

						{/* Formats */}
						<div>
							<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-4">Formats</p>
							<div className="space-y-3 rounded-xl border border-border p-4">
								<FormatRow label="HEX" value={hexStr} />
								<FormatRow label="RGB" value={rgbStr} />
								<FormatRow label="HSL" value={hslStr} />
								<FormatRow label="OKLCH" value={oklchStr} />
							</div>
						</div>

						{/* Reset */}
						{color !== originalColor && (
							<button
								type="button"
								onClick={() => onChange(originalColor)}
								className="w-full flex items-center justify-between rounded-xl border border-border px-5 py-4 cursor-pointer hover:bg-muted transition-colors"
							>
								<div className="flex items-center gap-4">
									<span className="size-8 rounded-full ring-2 ring-border" style={{ backgroundColor: originalColor }} />
									<div className="text-left">
										<p className="text-sm font-semibold text-foreground">Reset to original</p>
										<p className="text-[11px] font-mono text-muted-fg">{originalColor}</p>
									</div>
								</div>
								<span className="text-sm text-muted-fg">↩</span>
							</button>
						)}

						{/* Samples */}
						<div>
							<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-4">Samples</p>
							<p className="text-xs text-muted-fg mb-4 leading-relaxed">
								Click logo to sample. Drag dots to move. Click dot to exclude/include. Right-click to remove.
							</p>
							{samples.length > 0 ? (
								<div className="space-y-4">
									<div className="flex items-center gap-3 flex-wrap">
										{samples.map((dot, i) => (
											<button
												key={i}
												type="button"
												onClick={() =>
													setSamples((prev) => prev.map((s, j) => (j === i ? { ...s, excluded: !s.excluded } : s)))
												}
												onContextMenu={(e) => {
													e.preventDefault();
													setSamples((prev) => prev.filter((_, j) => j !== i));
												}}
												className={`size-9 rounded-full cursor-pointer transition-all border-2 border-white shadow-md ${dot.excluded ? 'opacity-30' : dot.color === color ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface' : ''} hover:scale-110`}
												style={{
													backgroundColor: dot.color,
													boxShadow: `0 0 0 1px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)`
												}}
												title={dot.color}
											/>
										))}
									</div>
									<div className="flex items-center justify-between">
										<span className="text-xs text-muted-fg">
											{included.length}/{samples.length} samples
										</span>
										<button
											type="button"
											onClick={() => setSamples([])}
											className="text-xs text-muted-fg hover:text-danger cursor-pointer transition-colors"
										>
											Clear all
										</button>
									</div>
								</div>
							) : (
								<p className="text-xs text-muted-fg/40">No samples yet</p>
							)}
						</div>
					</div>

					{/* Footer */}
					<div className="px-8 py-5 border-t border-border shrink-0 flex gap-3">
						<button
							type="button"
							onClick={onClose}
							className="flex-1 rounded-xl bg-accent py-3 text-sm font-bold text-white cursor-pointer hover:opacity-90 transition-colors"
						>
							Done
						</button>
						{color !== originalColor && (
							<button
								type="button"
								onClick={() => {
									onChange(originalColor);
									onClose();
								}}
								className="rounded-xl border border-border px-6 py-3 text-sm text-muted-fg cursor-pointer hover:text-foreground hover:bg-muted transition-colors"
							>
								Cancel
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default ColorStudio;
export { extractColors, parseColor, toHex };

const extractColors = (img: HTMLImageElement): string[] => {
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
