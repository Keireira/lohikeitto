'use client';

import { useEffect, useRef, useState } from 'react';
import { useHotkey } from '@tanstack/react-hotkeys';
import { toast } from '@/lib/toast';
import { API_URL } from '@/lib/api';
import { contrastText } from '@/lib/color';
import { getCachedImage, refetchImage } from '@/lib/image-cache';
import LogoStudio from '@/components/logo-studio';
import Squircle from '@/components/squircle';
import type { CategoryT, ServiceT } from '@/lib/types';


const toHex = (r: number, g: number, b: number): string =>
	`#${Math.min(255, Math.max(0, r)).toString(16).padStart(2, '0')}${Math.min(255, Math.max(0, g)).toString(16).padStart(2, '0')}${Math.min(255, Math.max(0, b)).toString(16).padStart(2, '0')}`;

// Parse any CSS color string to #hex
const parseColor = (input: string): string | null => {
	const s = input.trim().toLowerCase();
	// Already hex
	if (/^#[0-9a-f]{6}$/.test(s)) return s;
	if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
	// rgb(r, g, b) or rgba(r, g, b, a)
	const rgbMatch = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
	if (rgbMatch) return toHex(Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3]));
	// hsl(h, s%, l%) or hsla(h, s%, l%, a)
	const hslMatch = s.match(/^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/);
	if (hslMatch) {
		const h = Number(hslMatch[1]) / 360;
		const sat = Number(hslMatch[2]) / 100;
		const l = Number(hslMatch[3]) / 100;
		const hue2rgb = (p: number, q: number, t: number) => {
			if (t < 0) t += 1;
			if (t > 1) t -= 1;
			if (t < 1 / 6) return p + (q - p) * 6 * t;
			if (t < 1 / 2) return q;
			if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
			return p;
		};
		const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
		const p = 2 * l - q;
		return toHex(
			Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
			Math.round(hue2rgb(p, q, h) * 255),
			Math.round(hue2rgb(p, q, h - 1 / 3) * 255)
		);
	}
	// Use browser to parse (named colors etc)
	if (typeof document !== 'undefined') {
		const ctx = document.createElement('canvas').getContext('2d');
		if (ctx) {
			ctx.fillStyle = s;
			const result = ctx.fillStyle;
			if (result.startsWith('#')) return result;
		}
	}
	return null;
};

// ── Color extraction ───────────────────────────────

const extractColors = (img: HTMLImageElement): string[] => {
	const canvas = document.createElement('canvas');
	const size = 64;
	canvas.width = size;
	canvas.height = size;
	const ctx = canvas.getContext('2d');
	if (!ctx) return [];
	ctx.drawImage(img, 0, 0, size, size);
	const data = ctx.getImageData(0, 0, size, size).data;

	const buckets = new Map<string, number>();
	for (let i = 0; i < data.length; i += 4) {
		const r = data[i];
		const g = data[i + 1];
		const b = data[i + 2];
		const a = data[i + 3];
		if (a < 128) continue;
		const lum = 0.299 * r + 0.587 * g + 0.114 * b;
		if (lum > 240 || lum < 15) continue;
		const hex = toHex(Math.round(r / 32) * 32, Math.round(g / 32) * 32, Math.round(b / 32) * 32);
		buckets.set(hex, (buckets.get(hex) ?? 0) + 1);
	}

	const sorted = [...buckets.entries()].sort((a, b) => b[1] - a[1]);
	const results: string[] = [];
	if (sorted[0]) results.push(sorted[0][0]);

	let bestSat = -1;
	let vibrant = '';
	for (const [hex] of sorted.slice(0, 20)) {
		const r = parseInt(hex.slice(1, 3), 16);
		const g = parseInt(hex.slice(3, 5), 16);
		const b = parseInt(hex.slice(5, 7), 16);
		const sat = Math.max(r, g, b) === 0 ? 0 : (Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b);
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
	let cr = 0;
	let cg = 0;
	let cb = 0;
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

// ── Component ──────────────────────────────────────

type Props = {
	service?: ServiceT;
	categories: CategoryT[];
	prefillSlug?: string;
	onClose: () => void;
	onUpdate: (updated: ServiceT) => void;
};

const EMPTY_SERVICE: ServiceT = {
	id: '',
	name: '',
	slug: '',
	domains: [],
	verified: false,
	category: null,
	colors: { primary: '#0053db' },
	logo_url: '',
	ref_link: null,
};

const ServiceEditor = ({ service: serviceProp, categories, prefillSlug, onClose, onUpdate }: Props) => {
	const isCreateMode = !serviceProp;
	const service = serviceProp ?? EMPTY_SERVICE;

	const [name, setName] = useState(service.name);
	const [slug, setSlug] = useState(prefillSlug || service.slug);
	const [committedSlug, setCommittedSlug] = useState(prefillSlug || service.slug);
	const [domains, setDomains] = useState<string[]>(service.domains);
	const [domainInput, setDomainInput] = useState('');
	const [categoryId, setCategoryId] = useState(service.category?.id ?? '');
	const [color, setColor] = useState(service.colors.primary);
	const [refLink, setRefLink] = useState(service.ref_link ?? '');
	const [verified, setVerified] = useState(service.verified);
	const [saving, setSaving] = useState(false);
	const [copied, setCopied] = useState(false);
	const [suggestions, setSuggestions] = useState<string[]>([]);
	const [samplerOpen, setSamplerOpen] = useState(false);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [samples, setSamples] = useState<string[]>([]);
	const [excludedSamples, setExcludedSamples] = useState<Set<number>>(new Set());
	const [logoOk, setLogoOk] = useState(false);
	const [logoBlobUrl, setLogoBlobUrl] = useState<string | undefined>(undefined);
	const [logoStudioOpen, setLogoStudioOpen] = useState(false);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	const proxiedLogo = committedSlug ? `${API_URL}/s3/file/logos/${committedSlug}.webp` : '';

	useEffect(() => {
		setName(service.name);
		setSlug(prefillSlug || service.slug);
		setCommittedSlug(prefillSlug || service.slug);
		setDomains(service.domains);
		setDomainInput('');
		setCategoryId(service.category?.id ?? '');
		setColor(service.colors.primary);
		setRefLink(service.ref_link ?? '');
		setVerified(service.verified);
		setSuggestions([]);
		setSamplerOpen(false);
		setSamples([]);
		setExcludedSamples(new Set());
		setLogoStudioOpen(false);
	}, [service.id]);

	// Load logo + extract colors
	useEffect(() => {
		if (!proxiedLogo) { setLogoOk(false); setLogoBlobUrl(undefined); return; }
		let cancelled = false;
		(async () => {
			try {
				const blobUrl = await getCachedImage(proxiedLogo);
				if (cancelled) return;
				setLogoBlobUrl(blobUrl);
				const img = new Image();
				img.onload = () => {
					if (!cancelled) {
						setSuggestions(extractColors(img));
						setLogoOk(true);
					}
				};
				img.onerror = () => { if (!cancelled) { setLogoOk(false); setSuggestions([]); } };
				img.src = blobUrl;
			} catch {
				if (!cancelled) { setLogoOk(false); setLogoBlobUrl(undefined); setSuggestions([]); }
			}
		})();
		return () => { cancelled = true; };
	}, [proxiedLogo]);

	// Sampler canvas
	useEffect(() => {
		if (!samplerOpen) return;
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(proxiedLogo);
				if (!res.ok) return;
				const blob = await res.blob();
				const url = URL.createObjectURL(blob);
				const img = new Image();
				img.onload = () => {
					if (cancelled) {
						URL.revokeObjectURL(url);
						return;
					}
					const canvas = canvasRef.current;
					if (!canvas) return;
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
					const w = img.naturalWidth * scale;
					const h = img.naturalHeight * scale;
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
	}, [samplerOpen, proxiedLogo]);

	const sampleFromCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const rect = canvas.getBoundingClientRect();
		const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
		const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
		const [r, g, b] = ctx.getImageData(x, y, 1, 1).data;
		setSamples((prev) => [...prev, toHex(r, g, b)]);
	};

	const includedSamples = samples.filter((_, i) => !excludedSamples.has(i));

	const averageSamples = () => {
		if (includedSamples.length === 0) return;
		let r = 0;
		let g = 0;
		let b = 0;
		for (const s of includedSamples) {
			r += parseInt(s.slice(1, 3), 16);
			g += parseInt(s.slice(3, 5), 16);
			b += parseInt(s.slice(5, 7), 16);
		}
		const n = includedSamples.length;
		setColor(toHex(Math.round(r / n), Math.round(g / n), Math.round(b / n)));
	};

	// Auto-apply average when samples change
	useEffect(() => {
		if (includedSamples.length > 0) {
			let r = 0;
			let g = 0;
			let b = 0;
			for (const s of includedSamples) {
				r += parseInt(s.slice(1, 3), 16);
				g += parseInt(s.slice(3, 5), 16);
				b += parseInt(s.slice(5, 7), 16);
			}
			const n = includedSamples.length;
			setColor(toHex(Math.round(r / n), Math.round(g / n), Math.round(b / n)));
		}
	}, [samples.length, excludedSamples.size]);

	const sanitizeDomain = (raw: string): string =>
		raw
			.trim()
			.toLowerCase()
			.replace(/^https?:\/\//, '')
			.replace(/^www\./, '')
			.replace(/\/+$/, '');
	const addDomain = () => {
		const parts = domainInput
			.split(/[,\s]+/)
			.map(sanitizeDomain)
			.filter((d) => d && !domains.includes(d));
		if (parts.length > 0) setDomains((prev) => [...prev, ...parts]);
		setDomainInput('');
	};

	const copyId = () => {
		navigator.clipboard.writeText(service.id);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	const toggleVerified = async () => {
		const next = !verified;
		setVerified(next);
		try {
			const res = await fetch(`${API_URL}/services/${service.id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ verified: next })
			});
			if (!res.ok) throw new Error(`Failed: ${res.status}`);
			onUpdate({ ...service, verified: next });
		} catch (e) {
			setVerified(!next);
			toast.error(e instanceof Error ? e.message : 'Failed to update verification');
		}
	};

	const prevIdRef = useRef(service.id);
	useEffect(() => {
		prevIdRef.current = service.id;
	}, [service.id]);

	const hasChanges = isCreateMode
		? !!(name.trim() && slug.trim())
		: prevIdRef.current === service.id &&
			(name !== service.name ||
				slug !== service.slug ||
				JSON.stringify(domains) !== JSON.stringify(service.domains) ||
				categoryId !== (service.category?.id ?? '') ||
				color !== service.colors.primary ||
				refLink !== (service.ref_link ?? ''));

	// Cmd+Enter / Ctrl+Enter to save
	useHotkey('Mod+Enter', () => { if (hasChanges && !saving) handleSave(); });

	const resetForm = () => {
		setName(service.name);
		setSlug(prefillSlug || service.slug);
		setCommittedSlug(prefillSlug || service.slug);
		setDomains(service.domains);
		setDomainInput('');
		setCategoryId(service.category?.id ?? '');
		setColor(service.colors.primary);
		setRefLink(service.ref_link ?? '');
		setVerified(service.verified);
	};

	const handleSave = async () => {
		setSaving(true);
		try {
			if (isCreateMode) {
				if (!name.trim() || !slug.trim()) {
					toast.error('Name and slug are required');
					setSaving(false);
					return;
				}
				const res = await fetch(`${API_URL}/services`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						name: name.trim(),
						slug: slug.trim(),
						domains,
						category_id: categoryId || null,
						colors: { primary: color },
						ref_link: refLink || null,
					})
				});
				if (!res.ok) throw new Error(`Create failed: ${res.status}`);
				const created: ServiceT = await res.json();
				onUpdate(created);
			} else {
				const body: Record<string, unknown> = {};
				if (name !== service.name) body.name = name;
				if (slug !== service.slug) body.slug = slug;
				if (JSON.stringify(domains) !== JSON.stringify(service.domains)) body.domains = domains;
				const newCatId = categoryId || null;
				if (newCatId !== (service.category?.id ?? null)) body.category_id = newCatId;
				if (color !== service.colors.primary) body.colors = { primary: color };
				if (refLink !== (service.ref_link ?? '')) body.ref_link = refLink || null;
				if (Object.keys(body).length === 0) {
					setSaving(false);
					return;
				}

				const res = await fetch(`${API_URL}/services/${service.id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body)
				});
				if (!res.ok) throw new Error(`Save failed: ${res.status}`);

				const cat = categories.find((c) => c.id === categoryId) ?? null;
				onUpdate({
					...service,
					name,
					slug,
					domains,
					verified,
					category: cat ? { id: cat.id, title: cat.title } : null,
					colors: { primary: color },
					ref_link: refLink || null,
					logo_url: service.logo_url.replace(/\/[^/]+\.webp$/, `/${slug}.webp`)
				});
			}
		} catch (e) {
			toast.error(e instanceof Error ? e.message : (isCreateMode ? 'Create failed' : 'Save failed'));
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="rounded-2xl bg-surface border border-border overflow-hidden flex flex-col overflow-x-hidden">
			{/* Header — full color background */}
			<div className="shrink-0 px-6 py-5 space-y-4" style={{ backgroundColor: color }}>
				{/* Logo + name + close */}
				<div className="flex items-center gap-4 relative">
					<Squircle
						size={52}
						color={`${contrastText(color)}20`}
						src={logoOk ? logoBlobUrl : undefined}
						fallback={!logoOk ? (name || service.name).charAt(0).toUpperCase() : undefined}
						onClick={() => setPreviewOpen(true)}
						style={{ color: contrastText(color) }}
					/>
					<p
						className="flex-1 min-w-0 text-lg font-bold truncate"
						style={{ color: contrastText(color), textShadow: '0 1px 2px rgba(0,0,0,0.15)' }}
					>
						{name || service.name}
					</p>
				</div>

				{/* ID + verified pills */}
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={copyId}
						title="Click to copy ID"
						className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-mono cursor-pointer hover:opacity-80 transition-opacity"
						style={{ backgroundColor: `${contrastText(color)}15`, color: contrastText(color) }}
					>
						{copied ? 'Copied!' : `${service.id.slice(0, 8)}...${service.id.slice(-4)}`}
						<span className="opacity-50">{'⎘'}</span>
					</button>
					<button
						type="button"
						onClick={toggleVerified}
						title={verified ? 'Click to unverify' : 'Click to verify'}
						className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider cursor-pointer shadow-sm ${verified ? 'bg-success text-white' : 'bg-foreground/80 text-background'}`}
					>
						{verified ? '✓ Verified' : 'Unverified'}
					</button>
				</div>
			</div>

			{/* Body — scrollable */}
			<div className="flex-1 overflow-y-auto px-6 py-5 space-y-7">
				{/* ── Service Identity ── */}
				<Section title="Service Identity">
					<Label text="Service Name">
						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							className="ed-input"
						/>
					</Label>
					<Label text="Slug">
						<input
							value={slug}
							onChange={(e) => setSlug(e.target.value)}
							onBlur={() => setCommittedSlug(slug)}
							onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setCommittedSlug(slug); (e.target as HTMLInputElement).blur(); } }}
							className="ed-input font-mono"
						/>
					</Label>
				</Section>

				{/* ── Logo ── */}
				{slug && domains.length > 0 && (
					<Section title="Logo">
						<button
							type="button"
							onClick={() => setLogoStudioOpen(true)}
							className="w-full ed-input flex items-center gap-3 cursor-pointer hover:border-accent transition-colors text-left"
						>
							{logoBlobUrl && <img src={logoBlobUrl} alt="" className="size-8 rounded-lg object-cover bg-muted" />}
							{!logoBlobUrl && <div className="size-8 rounded-lg bg-muted" />}
							<span className="text-sm flex-1 text-muted-fg">{committedSlug}.webp</span>
							<span className="text-[10px] text-muted-fg">Logo Studio</span>
						</button>
					</Section>
				)}

				{/* ── Associated Domains ── */}
				<Section
					title="Associated Domains"
					action={
						<button
							type="button"
							onClick={addDomain}
							className="text-[10px] font-bold uppercase tracking-wider text-accent cursor-pointer hover:opacity-70"
						>
							+ Add Domain
						</button>
					}
				>
					<div className="flex flex-wrap gap-1.5">
						{domains.map((d) => (
							<span key={d} className="group flex items-center rounded-full bg-accent/5 text-xs font-mono text-accent">
								<a
									href={`https://${d}`}
									target="_blank"
									rel="noopener noreferrer"
									className="hover:underline pl-3 py-1.5"
									onClick={(e) => e.stopPropagation()}
								>
									{d}
								</a>
								<button
									type="button"
									onClick={() => setDomains((prev) => prev.filter((x) => x !== d))}
									className="text-accent/30 hover:text-danger cursor-pointer px-2 py-1.5"
								>
									{'✕'}
								</button>
							</span>
						))}
					</div>
					<input
						value={domainInput}
						onChange={(e) => setDomainInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								addDomain();
							}
						}}
						placeholder="Add domains..."
						className="ed-input font-mono text-xs"
					/>
				</Section>

				{/* ── Metadata ── */}
				<Section title="Metadata">
					<Label text="Category">
						<select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="ed-input">
							<option value="">None</option>
							{categories.map((c) => (
								<option key={c.id} value={c.id}>
									{c.title}
								</option>
							))}
						</select>
					</Label>
					<Label text="Referral Link">
						<input
							value={refLink}
							onChange={(e) => setRefLink(e.target.value)}
							placeholder="https://..."
							className="ed-input font-mono text-xs"
						/>
					</Label>
				</Section>

				{/* ── Brand Color ── */}
				<Section title="Brand Color">
					<button
						type="button"
						onClick={() => setSamplerOpen(true)}
						className="w-full ed-input flex items-center gap-3 cursor-pointer hover:border-accent transition-colors text-left"
					>
						<div className="size-8 rounded-full shrink-0" style={{ backgroundColor: color }} />
						<span className="font-mono text-sm flex-1">{color}</span>
						<span className="text-[10px] text-muted-fg">Edit</span>
					</button>
				</Section>
			</div>

			{/* Footer — always visible */}
			{hasChanges && (
				<div className="px-6 py-4 border-t border-border shrink-0 flex gap-3">
					<button
						type="button"
						onClick={handleSave}
						disabled={saving}
						className="flex-1 rounded-xl bg-accent py-3 text-sm font-bold text-white hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50"
					>
						{saving ? (isCreateMode ? 'Creating...' : 'Saving...') : (isCreateMode ? 'Create Service' : 'Save Changes')}
					</button>
					<button
						type="button"
						onClick={resetForm}
						className="rounded-xl border border-border px-6 py-3 text-sm font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
					>
						Cancel
					</button>
				</div>
			)}

			{/* Preview Modal (click on logo) */}
			{previewOpen && (
				<PreviewModal
					color={color}
					logoOk={logoOk}
					proxiedLogo={proxiedLogo}
					name={name || service.name}
					onClose={() => setPreviewOpen(false)}
				/>
			)}

			{/* Logo Studio */}
			{logoStudioOpen && slug && domains.length > 0 && (
				<LogoStudio
					domain={domains[0]}
					slug={slug}
					onSave={async (source) => {
						const res = await fetch(`${API_URL}/logos/save`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ domain: domains[0], slug, source })
						});
						if (!res.ok) { const err = await res.text(); throw new Error(err || `${res.status}`); }
						const result = await res.json();
						toast.success(`Logo saved to ${result.saved}`);
						if (proxiedLogo) {
							const newBlobUrl = await refetchImage(proxiedLogo);
							setLogoBlobUrl(newBlobUrl);
							setLogoOk(true);
						}
					}}
					onClose={() => setLogoStudioOpen(false)}
				/>
			)}

			{/* Color Studio Modal — horizontal layout */}
			{samplerOpen && (
				<ColorStudioModal
					color={color}
					originalColor={service.colors.primary}
					setColor={setColor}
					logoOk={logoOk}
					proxiedLogo={proxiedLogo}
					name={name || service.name}
					canvasRef={canvasRef}
					sampleFromCanvas={sampleFromCanvas}
					samples={samples}
					setSamples={setSamples}
					excludedSamples={excludedSamples}
					setExcludedSamples={setExcludedSamples}
					includedSamples={includedSamples}
					averageSamples={averageSamples}
					onClose={() => {
						setSamplerOpen(false);
						setSamples([]);
						setExcludedSamples(new Set());
					}}
				/>
			)}

			<style>{`
				.ed-input {
					width: 100%;
					border-radius: 0.5rem;
					border: 1px solid var(--border);
					background: var(--surface);
					padding: 0.625rem 0.75rem;
					font-size: 0.875rem;
					outline: none;
					transition: border-color 0.15s;
				}
				.ed-input:focus, .ed-input:focus-within {
					border-color: var(--accent);
				}
			`}</style>
		</div>
	);
};

const Section = ({
	title,
	action,
	children
}: {
	title: string;
	action?: React.ReactNode;
	children: React.ReactNode;
}) => (
	<div>
		<div className="flex items-center justify-between mb-3">
			<span className="text-[10px] font-bold uppercase tracking-widest text-accent">{title}</span>
			{action}
		</div>
		<div className="space-y-3">{children}</div>
	</div>
);

const Label = ({ text, children }: { text: string; children: React.ReactNode }) => (
	<div>
		<span className="text-xs text-muted-fg mb-1 block">{text}</span>
		{children}
	</div>
);

const ColorStudioModal = ({
	color,
	originalColor,
	setColor,
	logoOk,
	proxiedLogo,
	name,
	canvasRef,
	sampleFromCanvas,
	samples,
	setSamples,
	excludedSamples,
	setExcludedSamples,
	includedSamples,
	averageSamples,
	onClose
}: {
	color: string;
	originalColor: string;
	setColor: (c: string) => void;
	logoOk: boolean;
	proxiedLogo: string;
	name: string;
	canvasRef: React.RefObject<HTMLCanvasElement | null>;
	sampleFromCanvas: (e: React.MouseEvent<HTMLCanvasElement>) => void;
	samples: string[];
	setSamples: React.Dispatch<React.SetStateAction<string[]>>;
	excludedSamples: Set<number>;
	setExcludedSamples: React.Dispatch<React.SetStateAction<Set<number>>>;
	includedSamples: string[];
	averageSamples: () => void;
	onClose: () => void;
}) => {
	const [zoom, setZoom] = useState(1);
	const [isPanning, setIsPanning] = useState(false);
	const zoomContainerRef = useRef<HTMLDivElement>(null);
	const panStart = useRef<{ x: number; y: number; scrollX: number; scrollY: number } | null>(null);

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

	// Non-passive wheel listener to prevent page zoom
	useEffect(() => {
		const el = zoomContainerRef.current;
		if (!el) return;
		const wheelHandler = (e: WheelEvent) => {
			e.preventDefault();
			e.stopPropagation();
			const delta = e.deltaY > 0 ? -0.25 : 0.25;
			setZoom((z) => Math.min(8, Math.max(1, z + delta)));
		};
		el.addEventListener('wheel', wheelHandler, { passive: false });
		return () => el.removeEventListener('wheel', wheelHandler);
	}, []);

	// Space/Cmd/Ctrl/Shift key for pan mode
	useEffect(() => {
		const panKeys = new Set([
			'Space',
			'MetaLeft',
			'MetaRight',
			'ControlLeft',
			'ControlRight',
			'ShiftLeft',
			'ShiftRight'
		]);
		const down = (e: KeyboardEvent) => {
			if (panKeys.has(e.code) && !isPanning) {
				e.preventDefault();
				setIsPanning(true);
			}
		};
		const up = (e: KeyboardEvent) => {
			if (panKeys.has(e.code)) {
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
	}, [isPanning]);

	const handlePanStart = (e: React.MouseEvent) => {
		if (!isPanning && e.button !== 1) return;
		e.preventDefault();
		const el = zoomContainerRef.current;
		if (!el) return;
		panStart.current = { x: e.clientX, y: e.clientY, scrollX: el.scrollLeft, scrollY: el.scrollTop };
	};

	const handlePanMove = (e: React.MouseEvent) => {
		if (!panStart.current) return;
		const el = zoomContainerRef.current;
		if (!el) return;
		el.scrollLeft = panStart.current.scrollX - (e.clientX - panStart.current.x);
		el.scrollTop = panStart.current.scrollY - (e.clientY - panStart.current.y);
	};

	const handlePanEnd = () => {
		panStart.current = null;
	};

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
			onClick={onClose}
			onWheel={(e) => e.preventDefault()}
		>
			<div
				className="bg-surface rounded-2xl border border-border shadow-2xl w-[1100px] h-[80vh] overflow-hidden flex"
				onClick={(e) => e.stopPropagation()}
				onWheel={(e) => e.stopPropagation()}
			>
				{/* Left: preview + eyedropper canvas */}
				<div className="flex-[2] shrink-0 flex flex-col border-r border-border">
					{/* Preview */}
					<div className="h-36 flex items-center justify-center shrink-0" style={{ backgroundColor: color }}>
						{logoOk ? (
							<img src={proxiedLogo} alt="" className="h-20 object-contain" />
						) : (
							<span className="text-5xl font-bold" style={{ color: contrastText(color) }}>
								{name.charAt(0).toUpperCase()}
							</span>
						)}
					</div>
					{/* Canvas with zoom */}
					<div className="flex-1 flex flex-col min-h-0">
						<div
							ref={zoomContainerRef}
							className={`flex-1 overflow-auto p-3 relative select-none ${isPanning ? 'cursor-grab active:cursor-grabbing' : ''}`}
							onMouseDown={handlePanStart}
							onMouseMove={handlePanMove}
							onMouseUp={handlePanEnd}
							onMouseLeave={handlePanEnd}
						>
							<div
								className="rounded-xl overflow-hidden border border-border"
								style={{ width: zoom === 1 ? '100%' : `${zoom * 100}%`, touchAction: 'none' }}
							>
								<canvas
									ref={canvasRef}
									width={512}
									height={512}
									onClick={(e) => {
										if (!isPanning) sampleFromCanvas(e);
									}}
									onTouchStart={(e) => {
										if (e.touches.length === 2) {
											(e.currentTarget as HTMLCanvasElement).dataset.pinchDist = String(
												Math.hypot(
													e.touches[0].clientX - e.touches[1].clientX,
													e.touches[0].clientY - e.touches[1].clientY
												)
											);
										}
									}}
									onTouchMove={(e) => {
										if (e.touches.length === 2) {
											const prev = Number((e.currentTarget as HTMLCanvasElement).dataset.pinchDist ?? 0);
											const dist = Math.hypot(
												e.touches[0].clientX - e.touches[1].clientX,
												e.touches[0].clientY - e.touches[1].clientY
											);
											if (prev > 0) {
												const scale = dist / prev;
												setZoom((z) => Math.min(8, Math.max(1, z * scale)));
											}
											(e.currentTarget as HTMLCanvasElement).dataset.pinchDist = String(dist);
										}
									}}
									className="w-full h-auto cursor-crosshair"
								/>
							</div>
							{/* Zoom controls overlay */}
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
				<div className="flex-1 flex flex-col min-w-[320px]">
					<div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
						<div>
							<span className="text-[10px] font-bold uppercase tracking-widest text-accent">Color Studio</span>
							<h3 className="text-base font-bold text-foreground">Brand Color</h3>
						</div>
						<button type="button" onClick={onClose} className="text-muted-fg hover:text-foreground cursor-pointer">
							{'✕'}
						</button>
					</div>

					<div className="flex-1 overflow-y-auto px-8 py-7 space-y-7">
						{/* Picker */}
						<div>
							<span className="text-[10px] font-bold uppercase tracking-widest text-accent block mb-3">Manual</span>
							<div className="flex items-center gap-3">
								<label className="relative size-11 rounded-full overflow-hidden cursor-pointer shrink-0 border border-border">
									<input
										type="color"
										value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#000000'}
										onChange={(e) => setColor(e.target.value)}
										className="absolute inset-[-8px] w-[calc(100%+16px)] h-[calc(100%+16px)] cursor-pointer border-0 p-0"
									/>
								</label>
								<input
									value={color}
									onChange={(e) => {
										const parsed = parseColor(e.target.value);
										setColor(parsed ?? e.target.value);
									}}
									onPaste={(e) => {
										const text = e.clipboardData.getData('text');
										const parsed = parseColor(text);
										if (parsed) {
											e.preventDefault();
											setColor(parsed);
										}
									}}
									placeholder="#000000"
									className="ed-input font-mono flex-1 text-base"
								/>
							</div>
						</div>

						{/* Reset */}
						{color !== originalColor && (
							<button
								type="button"
								onClick={() => setColor(originalColor)}
								className="w-full flex items-center justify-between rounded-xl border border-border px-5 py-4 cursor-pointer hover:bg-muted transition-colors group"
							>
								<div className="flex items-center gap-4">
									<span className="size-8 rounded-full ring-2 ring-border" style={{ backgroundColor: originalColor }} />
									<div className="text-left">
										<p className="text-sm font-bold text-foreground">Reset to original</p>
										<p className="text-xs font-mono text-muted-fg">{originalColor}</p>
									</div>
								</div>
								<span className="text-sm text-muted-fg group-hover:text-foreground">↩</span>
							</button>
						)}

						{/* Eyedropper samples */}
						<div>
							<span className="text-[10px] font-bold uppercase tracking-widest text-accent block mb-3">Samples</span>
							<p className="text-sm text-muted-fg mb-3">
								Click logo to sample. Click sample to exclude/include. Right-click sample to delete.
							</p>
							{samples.length > 0 ? (
								<div className="space-y-4">
									<div className="flex items-center gap-3 flex-wrap">
										{samples.map((c, i) => {
											const excluded = excludedSamples.has(i);

											return (
												<button
													key={`${c}-${i}`}
													type="button"
													onClick={() => {
														setExcludedSamples((prev) => {
															const next = new Set(prev);
															if (next.has(i)) next.delete(i);
															else next.add(i);
															return next;
														});
													}}
													onContextMenu={(e) => {
														e.preventDefault();
														setSamples((prev) => prev.filter((_, j) => j !== i));
														setExcludedSamples((prev) => {
															const next = new Set<number>();
															for (const v of prev) {
																if (v < i) next.add(v);
																else if (v > i) next.add(v - 1);
															}
															return next;
														});
													}}
													className={`relative size-9 rounded-full cursor-pointer hover:scale-105 transition-all ${excluded ? 'opacity-30 ring-1 ring-border' : c === color ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : 'ring-1 ring-border'}`}
													style={{ backgroundColor: c }}
													title={`${c} — click to ${excluded ? 'include' : 'exclude'}, right-click to remove`}
												/>
											);
										})}
									</div>
									<div className="flex gap-3 pt-1">
										<button
											type="button"
											onClick={averageSamples}
											className="rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-white cursor-pointer hover:opacity-90"
										>
											Apply average ({includedSamples.length}/{samples.length})
										</button>
										<button
											type="button"
											onClick={() => {
												setSamples([]);
												setExcludedSamples(new Set());
											}}
											className="rounded-full border border-border px-5 py-2.5 text-sm text-muted-fg cursor-pointer hover:text-foreground"
										>
											Clear
										</button>
									</div>
								</div>
							) : (
								<p className="text-sm text-muted-fg/40">No samples yet</p>
							)}
						</div>
					</div>

					<div className="px-6 py-4 border-t border-border shrink-0">
						<div className="flex gap-3">
							<button
								type="button"
								onClick={onClose}
								className="flex-1 rounded-xl bg-accent py-2.5 text-sm font-bold text-white cursor-pointer hover:opacity-90 transition-colors"
							>
								Done
							</button>
							{color !== originalColor && (
								<button
									type="button"
									onClick={() => {
										setColor(originalColor);
										onClose();
									}}
									className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-muted-fg cursor-pointer hover:text-foreground hover:bg-muted transition-colors"
								>
									Cancel
								</button>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

const PreviewModal = ({
	color,
	logoOk,
	proxiedLogo,
	name,
	onClose
}: {
	color: string;
	logoOk: boolean;
	proxiedLogo: string;
	name: string;
	onClose: () => void;
}) => {
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

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
			<div className="relative rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
				<div className="w-[480px] h-[480px] flex items-center justify-center" style={{ backgroundColor: color }}>
					<Squircle
						size={200}
						color="transparent"
						src={logoOk ? proxiedLogo : undefined}
						fallback={!logoOk ? name.charAt(0).toUpperCase() : undefined}
						style={{ color: contrastText(color), fontSize: '5rem' }}
					/>
				</div>
				<div className="absolute bottom-4 left-0 right-0 flex justify-center">
					<span
						className="rounded-full px-4 py-1.5 text-sm font-mono font-medium backdrop-blur-md"
						style={{ backgroundColor: `${contrastText(color)}20`, color: contrastText(color) }}
					>
						{color}
					</span>
				</div>
				<button
					type="button"
					onClick={onClose}
					className="absolute top-3 right-3 size-8 rounded-lg flex items-center justify-center text-sm cursor-pointer"
					style={{ backgroundColor: `${contrastText(color)}20`, color: contrastText(color) }}
				>
					{'✕'}
				</button>
			</div>
		</div>
	);
};

export default ServiceEditor;
