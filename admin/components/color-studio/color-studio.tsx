'use client';

import { useHotkey } from '@tanstack/react-hotkeys';
import { useEffect, useRef, useState } from 'react';
import { contrastText, hexToRgb, parseColor, rgbToHsl, rgbToOklch, toHex } from '@/lib/color';
import type { Props, Sample } from './color-studio.d';
import FormatRow from './format-row';

const LOUPE_GRID = 13;
const LOUPE_SIZE = 130;
const LOUPE_PX = LOUPE_SIZE / LOUPE_GRID;
const GRAB_RADIUS = 0.04;

const ColorStudio = ({ color, originalColor, logoUrl, logoOk, name, onChange, onClose }: Props) => {
	const [samples, setSamples] = useState<Sample[]>([]);
	const [colorInput, setColorInput] = useState(color);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const wrapRef = useRef<HTMLDivElement>(null);
	const [loupePos, setLoupePos] = useState<{ x: number; y: number } | null>(null);
	const [loupeColor, setLoupeColor] = useState('#000000');
	const [loupePixels, setLoupePixels] = useState<string[]>([]);
	const [moveMode, setMoveMode] = useState(false);
	const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
	const [canvasLoading, setCanvasLoading] = useState(true);

	useEffect(() => {
		setColorInput(color);
	}, [color]);

	useHotkey('Escape', () => onClose());

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.key === 'Meta' || e.key === 'Control') setMoveMode(true);
		};
		const up = (e: KeyboardEvent) => {
			if (e.key === 'Meta' || e.key === 'Control') {
				setMoveMode(false);
				setDraggingIdx(null);
			}
		};
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);
		return () => {
			window.removeEventListener('keydown', down);
			window.removeEventListener('keyup', up);
		};
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		let cancelled = false;
		setCanvasLoading(true);
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
					ctx.fillStyle = '#fff';
					ctx.fillRect(0, 0, size, size);
					for (let y = 0; y < size; y += 8)
						for (let x = 0; x < size; x += 8)
							if ((x / 8 + y / 8) % 2 === 0) {
								ctx.fillStyle = '#e5e5e5';
								ctx.fillRect(x, y, 8, 8);
							}
					const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
					const w = img.naturalWidth * scale,
						h = img.naturalHeight * scale;
					ctx.drawImage(img, Math.round((size - w) / 2), Math.round((size - h) / 2), Math.round(w), Math.round(h));
					URL.revokeObjectURL(url);
					setCanvasLoading(false);
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

	// Sample pixel grid for loupe
	const samplePixels = (clientX: number, clientY: number) => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const rect = canvas.getBoundingClientRect();
		const cx = Math.floor((clientX - rect.left) * (canvas.width / rect.width));
		const cy = Math.floor((clientY - rect.top) * (canvas.height / rect.height));
		const half = Math.floor(LOUPE_GRID / 2);
		const pixels: string[] = [];
		for (let dy = -half; dy <= half; dy++) {
			for (let dx = -half; dx <= half; dx++) {
				const px = cx + dx,
					py = cy + dy;
				if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) {
					pixels.push('#e5e5e5');
				} else {
					const [pr, pg, pb] = ctx.getImageData(px, py, 1, 1).data;
					pixels.push(toHex(pr, pg, pb));
				}
			}
		}
		setLoupePixels(pixels);
		if (cx >= 0 && cy >= 0 && cx < canvas.width && cy < canvas.height) {
			const [sr, sg, sb] = ctx.getImageData(cx, cy, 1, 1).data;
			setLoupeColor(toHex(sr, sg, sb));
		}
	};

	const canvasNorm = (e: React.MouseEvent | MouseEvent): { nx: number; ny: number; px: number; py: number } | null => {
		const canvas = canvasRef.current;
		if (!canvas) return null;
		const rect = canvas.getBoundingClientRect();
		const nx = (e.clientX - rect.left) / rect.width;
		const ny = (e.clientY - rect.top) / rect.height;
		return { nx, ny, px: e.clientX - rect.left, py: e.clientY - rect.top };
	};

	const nearestSample = (nx: number, ny: number): number | null => {
		let best = -1,
			bestDist = GRAB_RADIUS;
		for (let i = 0; i < samples.length; i++) {
			const dx = samples[i].x - nx,
				dy = samples[i].y - ny;
			const dist = Math.sqrt(dx * dx + dy * dy);
			if (dist < bestDist) {
				best = i;
				bestDist = dist;
			}
		}
		return best >= 0 ? best : null;
	};

	const sampleColorAt = (nx: number, ny: number): string | null => {
		const canvas = canvasRef.current;
		if (!canvas) return null;
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		const cx = Math.floor(nx * canvas.width),
			cy = Math.floor(ny * canvas.height);
		if (cx < 0 || cy < 0 || cx >= canvas.width || cy >= canvas.height) return null;
		const [sr, sg, sb] = ctx.getImageData(cx, cy, 1, 1).data;
		return toHex(sr, sg, sb);
	};

	const handleCanvasMove = (e: React.MouseEvent) => {
		const pos = canvasNorm(e);
		if (!pos) return;
		setLoupePos({ x: pos.px, y: pos.py });

		if (draggingIdx !== null) {
			const hex = sampleColorAt(pos.nx, pos.ny);
			if (hex) {
				setSamples((prev) => prev.map((s, i) => (i === draggingIdx ? { ...s, x: pos.nx, y: pos.ny, color: hex } : s)));
			}
			return;
		}

		if (!moveMode) samplePixels(e.clientX, e.clientY);
	};

	const handleCanvasDown = (e: React.MouseEvent) => {
		if (!moveMode) return;
		const pos = canvasNorm(e);
		if (!pos) return;
		const idx = nearestSample(pos.nx, pos.ny);
		if (idx !== null) {
			e.preventDefault();
			setDraggingIdx(idx);
		}
	};

	const handleCanvasUp = () => {
		setDraggingIdx(null);
	};

	const handleCanvasClick = (e: React.MouseEvent) => {
		if (moveMode) return;
		const pos = canvasNorm(e);
		if (!pos) return;
		const hex = sampleColorAt(pos.nx, pos.ny);
		if (hex) setSamples((prev) => [...prev, { color: hex, x: pos.nx, y: pos.ny, excluded: false }]);
	};

	// Auto-apply average of included samples
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
	}, [included.length, onChange, included]);

	const [r, g, b] = hexToRgb(color);
	const [h, s, l] = rgbToHsl(r, g, b);
	const [okL, okC, okH] = rgbToOklch(r, g, b);
	const rgbStr = `rgb(${r}, ${g}, ${b})`;
	const hslStr = `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`;
	const oklchStr = `oklch(${okL.toFixed(3)} ${okC.toFixed(3)} ${Math.round(okH)})`;

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
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
			<div
				className="bg-surface rounded-2xl border border-border shadow-2xl w-[1100px] max-w-[95vw] h-[85vh] overflow-hidden flex"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Left: logo canvas with loupe magnifier */}
				<div className="flex-[2] shrink-0 flex flex-col border-r border-border">
					{/* Color preview strip */}
					<div
						className="min-h-24 py-5 flex items-center justify-center shrink-0 transition-colors"
						style={{ backgroundColor: color }}
					>
						{logoOk ? (
							<img src={logoUrl} alt="" className="h-14 object-contain" />
						) : (
							<span className="text-4xl font-bold" style={{ color: contrastText(color) }}>
								{name.charAt(0).toUpperCase()}
							</span>
						)}
					</div>

					{/* Canvas area */}
					<div className="flex-1 flex flex-col min-h-0">
						<div
							ref={wrapRef}
							className="flex-1 overflow-hidden p-3"
							onMouseMove={handleCanvasMove}
							onMouseLeave={() => setLoupePos(null)}
						>
							<div className="relative w-full aspect-square max-h-full mx-auto">
								<canvas
									ref={canvasRef}
									width={512}
									height={512}
									onClick={handleCanvasClick}
									onMouseDown={handleCanvasDown}
									onMouseUp={handleCanvasUp}
									className={`absolute inset-0 w-full h-full rounded-xl border border-border ${moveMode ? (draggingIdx !== null ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-none'}`}
								/>

								{/* Sample markers at pick positions */}
								{samples.map((dot, i) => (
									<div
										key={i}
										className={`absolute pointer-events-none ${dot.excluded ? 'opacity-30' : ''}`}
										style={{ left: `${dot.x * 100}%`, top: `${dot.y * 100}%`, transform: 'translate(-50%, -50%)' }}
									>
										<div
											className="size-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.25),0_1px_3px_rgba(0,0,0,0.3)]"
											style={{ backgroundColor: dot.color }}
										/>
									</div>
								))}

								{/* Loading overlay */}
								{canvasLoading && (
									<div className="absolute inset-0 flex items-center justify-center bg-surface/80 rounded-xl z-20">
										<div className="size-6 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
									</div>
								)}

								{/* Loupe magnifier following cursor */}
								{!moveMode && loupePos && loupePixels.length === LOUPE_GRID * LOUPE_GRID && (
									<div
										className="absolute pointer-events-none z-10"
										style={{
											left: loupePos.x - LOUPE_SIZE / 2,
											top: loupePos.y - LOUPE_SIZE / 2,
											width: LOUPE_SIZE
										}}
									>
										<div
											className="rounded-full overflow-hidden border-[3px] shadow-2xl"
											style={{ borderColor: loupeColor, width: LOUPE_SIZE, height: LOUPE_SIZE }}
										>
											<svg width={LOUPE_SIZE} height={LOUPE_SIZE} viewBox={`0 0 ${LOUPE_SIZE} ${LOUPE_SIZE}`}>
												<defs>
													<clipPath id="loupe-clip">
														<circle cx={LOUPE_SIZE / 2} cy={LOUPE_SIZE / 2} r={LOUPE_SIZE / 2} />
													</clipPath>
												</defs>
												<g clipPath="url(#loupe-clip)">
													{loupePixels.map((px, i) => {
														const row = Math.floor(i / LOUPE_GRID);
														const col = i % LOUPE_GRID;
														return (
															<rect
																key={i}
																x={col * LOUPE_PX}
																y={row * LOUPE_PX}
																width={LOUPE_PX + 0.5}
																height={LOUPE_PX + 0.5}
																fill={px}
															/>
														);
													})}
													<rect
														x={Math.floor(LOUPE_GRID / 2) * LOUPE_PX}
														y={Math.floor(LOUPE_GRID / 2) * LOUPE_PX}
														width={LOUPE_PX}
														height={LOUPE_PX}
														fill="none"
														stroke="rgba(255,255,255,0.9)"
														strokeWidth="1.5"
													/>
													<rect
														x={Math.floor(LOUPE_GRID / 2) * LOUPE_PX + 0.5}
														y={Math.floor(LOUPE_GRID / 2) * LOUPE_PX + 0.5}
														width={LOUPE_PX - 1}
														height={LOUPE_PX - 1}
														fill="none"
														stroke="rgba(0,0,0,0.3)"
														strokeWidth="1"
													/>
												</g>
											</svg>
										</div>
									</div>
								)}
							</div>
						</div>

						<div className="px-4 py-2.5 border-t border-border text-[10px] text-muted-fg bg-muted/10">
							{moveMode ? 'Drag samples to reposition' : 'Click to sample. Hold Cmd/Ctrl to move samples.'}
						</div>
					</div>
				</div>

				{/* Right: controls */}
				<div className="flex-1 flex flex-col min-w-[340px] bg-background">
					<div className="px-8 pt-6 pb-5 border-b border-border shrink-0">
						<p className="text-[11px] font-bold text-accent uppercase tracking-widest">Color Studio</p>
						<div className="flex items-center justify-between mt-1.5">
							<h3 className="text-lg font-bold text-foreground">Brand Color</h3>
							<button
								type="button"
								onClick={onClose}
								className="size-8 rounded-lg flex items-center justify-center text-muted-fg hover:text-foreground hover:bg-muted cursor-pointer transition-colors text-xl"
							>
								{'x'}
							</button>
						</div>
					</div>

					<div className="flex-1 overflow-y-auto px-8 py-7 space-y-8">
						{/* Manual input */}
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
								<FormatRow label="HEX" value={color} />
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
								<span className="text-sm text-muted-fg">{'<-'}</span>
							</button>
						)}

						{/* Samples */}
						<div>
							<p className="text-[10px] font-bold text-accent uppercase tracking-widest mb-4">Samples</p>
							<p className="text-xs text-muted-fg mb-4 leading-relaxed">
								Click dot to exclude/include. Right-click to remove.
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
													boxShadow: '0 0 0 1px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)'
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
