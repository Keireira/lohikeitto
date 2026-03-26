'use client';

import { useHotkey } from '@tanstack/react-hotkeys';
import { useEffect, useRef, useState } from 'react';
import ColorStudio, { extractColors, parseColor, toHex } from '@/components/color-studio';
import LogoStudio from '@/components/logo-studio';
import { logoApiUrl } from '@/components/service-icon';
import Squircle from '@/components/squircle';
import VectorizeWidget from '@/components/vectorize-widget';
import { API_URL } from '@/lib/api';
import { contrastText } from '@/lib/color';
import { useLogoCacheStore } from '@/lib/logo-cache';
import { toast } from '@/lib/toast';
import type { CategoryT, ServiceT } from '@/lib/types';

type Props = {
	service?: ServiceT;
	categories: CategoryT[];
	prefillSlug?: string;
	onClose: () => void;
	onUpdate: (updated: ServiceT) => void;
	onDelete?: (id: string) => void;
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
	ref_link: null
};

const ServiceEditor = ({ service: serviceProp, categories, prefillSlug, onClose, onUpdate, onDelete }: Props) => {
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
	const [logoOk, setLogoOk] = useState(false);
	const cachedLogoBlobUrl = useLogoCacheStore((s) => s.blobs.get(committedSlug));
	const setLogoCache = useLogoCacheStore((s) => s.set);
	const bustLogoCache = useLogoCacheStore((s) => s.bust);
	const [logoBlobUrl, setLogoBlobUrl] = useState<string | undefined>(undefined);
	const [logoStudioOpen, setLogoStudioOpen] = useState(false);
	const [vectorizeOpen, setVectorizeOpen] = useState(false);
	const [deleteConfirm, setDeleteConfirm] = useState(false);
	const [deleteInput, setDeleteInput] = useState('');
	const [deleting, setDeleting] = useState(false);
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
		setLogoStudioOpen(false);
		setLogoOk(false);
		setLogoBlobUrl(undefined);
	}, [service.id]);

	// Load logo + extract colors
	useEffect(() => {
		if (!committedSlug) {
			setLogoOk(false);
			setLogoBlobUrl(undefined);
			return;
		}
		// If already cached in store, use it
		if (cachedLogoBlobUrl) {
			setLogoBlobUrl(cachedLogoBlobUrl);
			const img = new Image();
			img.onload = () => {
				setSuggestions(extractColors(img));
				setLogoOk(true);
			};
			img.onerror = () => {
				setLogoOk(false);
				setSuggestions([]);
			};
			img.src = cachedLogoBlobUrl;
			return;
		}
		// Fetch fresh
		let cancelled = false;
		setLogoOk(false);
		setLogoBlobUrl(undefined);
		fetch(logoApiUrl(committedSlug), { cache: 'no-store' })
			.then((r) => (r.ok ? r.blob() : Promise.reject()))
			.then((blob) => {
				if (cancelled) return;
				const url = URL.createObjectURL(blob);
				setLogoBlobUrl(url);
				setLogoCache(committedSlug, url);
				const img = new Image();
				img.onload = () => {
					if (!cancelled) {
						setSuggestions(extractColors(img));
						setLogoOk(true);
					}
				};
				img.onerror = () => {
					if (!cancelled) {
						setLogoOk(false);
						setSuggestions([]);
					}
				};
				img.src = url;
			})
			.catch(() => {
				if (!cancelled) {
					setLogoOk(false);
					setLogoBlobUrl(undefined);
					setSuggestions([]);
				}
			});
		return () => {
			cancelled = true;
		};
	}, [committedSlug, cachedLogoBlobUrl]);

	// Sampler canvas
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
	useHotkey('Mod+Enter', () => {
		if (hasChanges && !saving) handleSave();
	});

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
						ref_link: refLink || null
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

				// Rename logo in S3 if slug changed
				if (slug !== service.slug) {
					const renameRes = await fetch(`${API_URL}/s3/rename`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ from: `logos/${service.slug}.webp`, to: `logos/${slug}.webp` })
					}).catch(() => null);
					if (renameRes?.ok) toast.info(`Logo renamed to ${slug}.webp`);
				}

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
			toast.error(e instanceof Error ? e.message : isCreateMode ? 'Create failed' : 'Save failed');
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="rounded-2xl bg-surface border border-border overflow-hidden flex flex-col overflow-x-hidden h-[calc(100vh-72px-2rem)]">
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
				<Section title="Service Identity">
					<Label text="Service Name">
						<input value={name} onChange={(e) => setName(e.target.value)} className="ed-input" />
					</Label>
					<Label text="Slug">
						<input
							value={slug}
							onChange={(e) => setSlug(e.target.value)}
							onBlur={() => setCommittedSlug(slug)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') {
									e.preventDefault();
									setCommittedSlug(slug);
									(e.target as HTMLInputElement).blur();
								}
							}}
							className="ed-input font-mono"
						/>
					</Label>
				</Section>

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
						{logoBlobUrl && (
							<button
								type="button"
								onClick={() => setVectorizeOpen(true)}
								className="w-full ed-input flex items-center gap-3 cursor-pointer hover:border-accent transition-colors text-left mt-1.5"
							>
								<span className="text-sm flex-1 text-muted-fg">Vectorize to SVG</span>
								<span className="text-[10px] text-muted-fg">Trace</span>
							</button>
						)}
					</Section>
				)}

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
						{saving ? (isCreateMode ? 'Creating...' : 'Saving...') : isCreateMode ? 'Create Service' : 'Save Changes'}
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

			{/* Delete */}
			{!isCreateMode && onDelete && (
				<div className="px-6 py-3 border-t border-border shrink-0">
					<button
						type="button"
						onClick={() => {
							setDeleteConfirm(true);
							setDeleteInput('');
						}}
						className="text-xs text-muted-fg hover:text-danger transition-colors cursor-pointer"
					>
						Delete service
					</button>
				</div>
			)}

			{/* Delete confirmation */}
			{deleteConfirm && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
					onClick={() => setDeleteConfirm(false)}
				>
					<div
						className="w-96 rounded-2xl bg-surface border border-border shadow-2xl overflow-hidden"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="px-6 pt-5 pb-4">
							<p className="text-sm font-bold text-foreground">Delete {service.name}?</p>
							<p className="text-xs text-muted-fg mt-1">
								This will permanently remove the service and unlink its logo. Type the service name to confirm.
							</p>
						</div>
						<div className="px-6 pb-4">
							<input
								type="text"
								value={deleteInput}
								onChange={(e) => setDeleteInput(e.target.value)}
								placeholder={service.name}
								autoFocus
								className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-danger/50"
							/>
						</div>
						<div className="px-6 py-3 border-t border-border flex gap-3">
							<button
								type="button"
								disabled={deleteInput !== service.name || deleting}
								onClick={async () => {
									setDeleting(true);
									try {
										// Move logo to trash
										await fetch(`${API_URL}/s3/rename`, {
											method: 'POST',
											headers: { 'Content-Type': 'application/json' },
											body: JSON.stringify({
												from: `logos/${service.slug}.webp`,
												to: `logos/.trash/${service.slug}.webp`
											})
										}).catch(() => null);
										// Delete service
										const res = await fetch(`${API_URL}/services/${service.id}`, { method: 'DELETE' });
										if (!res.ok) throw new Error(`${res.status}`);
										toast.success(`${service.name} deleted`);
										setDeleteConfirm(false);
										onDelete!(service.id);
									} catch (e) {
										toast.error(e instanceof Error ? e.message : 'Delete failed');
									} finally {
										setDeleting(false);
									}
								}}
								className="flex-1 rounded-xl bg-danger py-2.5 text-sm font-bold text-white hover:opacity-90 transition-colors cursor-pointer disabled:opacity-30"
							>
								{deleting ? 'Deleting...' : 'Delete permanently'}
							</button>
							<button
								type="button"
								onClick={() => setDeleteConfirm(false)}
								className="rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
							>
								Cancel
							</button>
						</div>
					</div>
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
			{logoStudioOpen && domains.length > 0 && (
				<LogoStudio
					domain={domains[0]}
					slug={committedSlug || slug}
					currentLogoUrl={proxiedLogo}
					onSave={async (source, saveSlug) => {
						const res = await fetch(`${API_URL}/logos/save`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ domain: domains[0], slug: saveSlug, source })
						});
						if (!res.ok) {
							const err = await res.text();
							throw new Error(err || `${res.status}`);
						}
						toast.success(`Logo saved to logos/${saveSlug}.webp`);
						setSlug(saveSlug);
						setCommittedSlug(saveSlug);
						// Bust cache → re-fetch for all components
						bustLogoCache(saveSlug);
						const res2 = await fetch(logoApiUrl(saveSlug), { cache: 'no-store' });
						if (res2.ok) {
							const blob = await res2.blob();
							const url = URL.createObjectURL(blob);
							setLogoCache(saveSlug, url);
						}
					}}
					onClose={() => setLogoStudioOpen(false)}
				/>
			)}

			{/* Vectorize */}
			{vectorizeOpen && logoBlobUrl && (
				<VectorizeWidget blobUrl={logoBlobUrl} slug={committedSlug || slug} onClose={() => setVectorizeOpen(false)} />
			)}

			{/* Color Studio */}
			{samplerOpen && (
				<ColorStudio
					color={color}
					originalColor={service.colors.primary}
					logoUrl={proxiedLogo}
					logoOk={logoOk}
					name={name || service.name}
					onChange={setColor}
					onClose={() => setSamplerOpen(false)}
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
