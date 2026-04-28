'use client';

import { useHotkey } from '@tanstack/react-hotkeys';
import { useEffect, useRef, useState } from 'react';
import ColorStudio, { extractColors } from '@/components/color-studio';
import LogoStudio from '@/components/logo-studio';
import { logoApiUrl } from '@/components/service-icon';
import Squircle from '@/components/squircle';
import { API_URL } from '@/lib/api';
import { contrastText } from '@/lib/color';
import { useLogoCacheStore } from '@/lib/logo-cache';
import { toast } from '@/lib/toast';
import type { CategoryT, ServiceT } from '@/lib/types';
import Label from './label';
import PreviewModal from './preview-modal';
import Section from './section';

const SOCIAL_PLATFORMS = [
	{ key: 'x', label: 'X', placeholder: 'https://x.com/...' },
	{ key: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/...' },
	{ key: 'github', label: 'GitHub', placeholder: 'https://github.com/...' },
	{ key: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@...' },
	{ key: 'discord', label: 'Discord', placeholder: 'https://discord.gg/...' },
	{ key: 'telegram', label: 'Telegram', placeholder: 'https://t.me/...' },
	{ key: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/company/...' },
	{ key: 'bluesky', label: 'Bluesky', placeholder: 'https://bsky.app/profile/...' },
	{ key: 'mastodon', label: 'Mastodon', placeholder: 'https://mastodon.social/@...' },
	{ key: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@...' },
	{ key: 'reddit', label: 'Reddit', placeholder: 'https://reddit.com/r/...' },
	{ key: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/...' },
	{ key: 'threads', label: 'Threads', placeholder: 'https://threads.net/@...' },
	{ key: 'twitch', label: 'Twitch', placeholder: 'https://twitch.tv/...' },
	{ key: 'vk', label: 'VK', placeholder: 'https://vk.com/...' }
];

export type Props = {
	service?: ServiceT;
	categories: CategoryT[];
	allTags?: string[];
	prefillSlug?: string;
	onClose: () => void;
	onUpdate: (updated: ServiceT) => void;
	onDelete?: (id: string) => void;
};

export const EMPTY_SERVICE: ServiceT = {
	id: '',
	name: '',
	slug: '',
	bundle_id: null,
	description: null,
	domains: [],
	alternative_names: [],
	tags: [],
	verified: false,
	category: null,
	colors: { primary: '#0053db' },
	social_links: {},
	logo_url: '',
	ref_link: null
};

const ServiceEditor = ({
	service: serviceProp,
	categories,
	allTags = [],
	prefillSlug,
	onClose,
	onUpdate,
	onDelete
}: Props) => {
	const isCreateMode = !serviceProp;
	const service = serviceProp ?? EMPTY_SERVICE;

	const [name, setName] = useState(service.name);
	const [slug, setSlug] = useState(prefillSlug || service.slug);
	const [committedSlug, setCommittedSlug] = useState(prefillSlug || service.slug);
	const [domains, setDomains] = useState<string[]>(service.domains);
	const [domainInput, setDomainInput] = useState('');
	const [categorySlug, setCategorySlug] = useState(service.category?.slug ?? '');
	const [color, setColor] = useState(service.colors.primary);
	const defaultBundleId = (s: string) => (s ? `com.${s}.root` : '');
	const [bundleId, setBundleId] = useState(service.bundle_id || defaultBundleId(prefillSlug || service.slug));
	const [description, setDescription] = useState(service.description ?? '');
	const [altNames, setAltNames] = useState<string[]>(service.alternative_names);
	const [altNameInput, setAltNameInput] = useState('');
	const [tags, setTags] = useState<string[]>(service.tags);
	const [tagInput, setTagInput] = useState('');
	const [socialLinks, setSocialLinks] = useState<Record<string, string>>(service.social_links);
	const [refLink, setRefLink] = useState(service.ref_link ?? '');
	const [verified, setVerified] = useState(service.verified);
	const [saving, setSaving] = useState(false);
	const [copied, setCopied] = useState(false);
	const [_suggestions, setSuggestions] = useState<string[]>([]);
	const [samplerOpen, setSamplerOpen] = useState(false);
	const [previewOpen, setPreviewOpen] = useState(false);
	const [logoOk, setLogoOk] = useState(false);
	const cachedLogoBlobUrl = useLogoCacheStore((s) => s.blobs.get(committedSlug));
	const setLogoCache = useLogoCacheStore((s) => s.set);
	const bustLogoCache = useLogoCacheStore((s) => s.bust);
	const [logoBlobUrl, setLogoBlobUrl] = useState<string | undefined>(undefined);
	const [logoStudioOpen, setLogoStudioOpen] = useState(false);
	const [socialStudioOpen, setSocialStudioOpen] = useState(false);
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
		setBundleId(service.bundle_id || defaultBundleId(prefillSlug || service.slug));
		setDescription(service.description ?? '');
		setAltNames(service.alternative_names);
		setAltNameInput('');
		setTags(service.tags);
		setTagInput('');
		setSocialLinks(service.social_links);
		setCategorySlug(service.category?.slug ?? '');
		setColor(service.colors.primary);
		setRefLink(service.ref_link ?? '');
		setVerified(service.verified);
		setSuggestions([]);
		setSamplerOpen(false);
		setLogoStudioOpen(false);
		setLogoOk(false);
		setLogoBlobUrl(undefined);
	}, [
		defaultBundleId,
		prefillSlug,
		service.alternative_names,
		service.bundle_id,
		service.category?.slug,
		service.colors.primary,
		service.description,
		service.domains,
		service.name,
		service.ref_link,
		service.slug,
		service.social_links,
		service.tags,
		service.verified
	]);

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
	}, [committedSlug, cachedLogoBlobUrl, setLogoCache]);

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
				bundleId !== (service.bundle_id ?? '') ||
				description !== (service.description ?? '') ||
				JSON.stringify(domains) !== JSON.stringify(service.domains) ||
				JSON.stringify(altNames) !== JSON.stringify(service.alternative_names) ||
				JSON.stringify(tags) !== JSON.stringify(service.tags) ||
				JSON.stringify(socialLinks) !== JSON.stringify(service.social_links) ||
				categorySlug !== (service.category?.slug ?? '') ||
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
		setBundleId(service.bundle_id || defaultBundleId(prefillSlug || service.slug));
		setDescription(service.description ?? '');
		setDomains(service.domains);
		setAltNames(service.alternative_names);
		setAltNameInput('');
		setTags(service.tags);
		setTagInput('');
		setSocialLinks(service.social_links);
		setDomainInput('');
		setCategorySlug(service.category?.slug ?? '');
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
						bundle_id: bundleId || `com.${slug.trim()}.root`,
						description: description || null,
						domains,
						alternative_names: altNames,
						tags,
						category_slug: categorySlug || null,
						colors: { primary: color },
						social_links: Object.keys(socialLinks).length > 0 ? socialLinks : null,
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
				if (bundleId !== (service.bundle_id ?? '')) body.bundle_id = bundleId || `com.${slug.trim()}.root`;
				if (description !== (service.description ?? '')) body.description = description || null;
				if (JSON.stringify(domains) !== JSON.stringify(service.domains)) body.domains = domains;
				if (JSON.stringify(altNames) !== JSON.stringify(service.alternative_names)) body.alternative_names = altNames;
				if (JSON.stringify(tags) !== JSON.stringify(service.tags)) body.tags = tags;
				if (JSON.stringify(socialLinks) !== JSON.stringify(service.social_links)) body.social_links = socialLinks;
				const newCatSlug = categorySlug || null;
				if (newCatSlug !== (service.category?.slug ?? null)) body.category_slug = newCatSlug;
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

				const cat = categories.find((c) => c.slug === categorySlug) ?? null;
				onUpdate({
					...service,
					name,
					slug,
					bundle_id: bundleId || `com.${slug.trim()}.root`,
					description: description || null,
					domains,
					alternative_names: altNames,
					tags,
					social_links: socialLinks,
					verified,
					category: cat ? { slug: cat.slug, title: cat.title } : null,
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
							onChange={(e) => {
								const newSlug = e.target.value;
								if (!bundleId || bundleId === defaultBundleId(slug)) {
									setBundleId(defaultBundleId(newSlug));
								}
								setSlug(newSlug);
							}}
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
					<Label text="Bundle ID">
						<input
							value={bundleId}
							onChange={(e) => setBundleId(e.target.value)}
							className="ed-input font-mono text-xs"
						/>
					</Label>
				</Section>

				{slug && (
					<Section title="Logo & Color">
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
						<button
							type="button"
							onClick={() => setSamplerOpen(true)}
							className="w-full ed-input flex items-center gap-3 cursor-pointer hover:border-accent transition-colors text-left"
						>
							<div className="size-8 rounded-full shrink-0" style={{ backgroundColor: color }} />
							<span className="font-mono text-sm flex-1">{color}</span>
							<span className="text-[10px] text-muted-fg">Color Studio</span>
						</button>
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

				<Section
					title="Alternative Names"
					action={
						<button
							type="button"
							onClick={() => {
								const parts = altNameInput
									.split(',')
									.map((s) => s.trim())
									.filter((s) => s && !altNames.includes(s));
								if (parts.length > 0) setAltNames((prev) => [...prev, ...parts]);
								setAltNameInput('');
							}}
							className="text-[10px] font-bold uppercase tracking-wider text-accent cursor-pointer hover:opacity-70"
						>
							+ Add
						</button>
					}
				>
					<div className="flex flex-wrap gap-1.5">
						{altNames.map((n) => (
							<span key={n} className="group flex items-center rounded-full bg-muted/50 text-xs">
								<span className="pl-3 py-1.5">{n}</span>
								<button
									type="button"
									onClick={() => setAltNames((prev) => prev.filter((x) => x !== n))}
									className="text-muted-fg/30 hover:text-danger cursor-pointer px-2 py-1.5"
								>
									{'✕'}
								</button>
							</span>
						))}
					</div>
					<input
						value={altNameInput}
						onChange={(e) => setAltNameInput(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								const parts = altNameInput
									.split(',')
									.map((s) => s.trim())
									.filter((s) => s && !altNames.includes(s));
								if (parts.length > 0) setAltNames((prev) => [...prev, ...parts]);
								setAltNameInput('');
							}
						}}
						placeholder="Add aliases (comma-separated)..."
						className="ed-input text-xs"
					/>
				</Section>

				<Section title="Tags">
					<div className="flex flex-wrap gap-1.5">
						{tags.map((t) => (
							<span key={t} className="group flex items-center rounded-full bg-muted/50 text-xs">
								<span className="pl-3 py-1.5">{t}</span>
								<button
									type="button"
									onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
									className="text-muted-fg/30 hover:text-danger cursor-pointer px-2 py-1.5"
								>
									{'✕'}
								</button>
							</span>
						))}
					</div>
					<TagInput
						value={tagInput}
						onChange={setTagInput}
						allTags={allTags}
						currentTags={tags}
						onAdd={(added) => {
							setTags((prev) => [...prev, ...added]);
							setTagInput('');
						}}
					/>
				</Section>

				<Section title="Metadata">
					<Label text="Category">
						<select value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)} className="ed-input">
							<option value="">None</option>
							{categories.map((c) => (
								<option key={c.slug} value={c.slug}>
									{c.title}
								</option>
							))}
						</select>
					</Label>
					<Label text="Description">
						<textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							placeholder="Short service description..."
							rows={3}
							className="ed-input resize-y text-xs"
						/>
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

				<Section title="Social Links">
					{(() => {
						const count = Object.keys(socialLinks).filter((k) => socialLinks[k]).length;
						return (
							<button
								type="button"
								onClick={() => setSocialStudioOpen(true)}
								className="w-full ed-input flex items-center gap-3 cursor-pointer hover:border-accent transition-colors text-left"
							>
								<div className="flex -space-x-1">
									{count > 0
										? SOCIAL_PLATFORMS.filter((p) => socialLinks[p.key])
												.slice(0, 5)
												.map((p) => (
													<span
														key={p.key}
														className="size-6 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold text-muted-fg ring-2 ring-surface"
													>
														{p.label.slice(0, 2)}
													</span>
												))
										: null}
								</div>
								<span className="text-sm flex-1 text-muted-fg">
									{count > 0 ? `${count} link${count > 1 ? 's' : ''}` : 'No social links'}
								</span>
								<span className="text-[10px] text-muted-fg">Edit</span>
							</button>
						);
					})()}
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
										onDelete?.(service.id);
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
			{logoStudioOpen && (
				<LogoStudio
					defaultQuery={domains[0] || name || service.name}
					slug={committedSlug || slug}
					currentLogoUrl={proxiedLogo}
					onSave={async (source, saveSlug, logoUrl) => {
						const res = await fetch(`${API_URL}/logos/save`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								domain: domains[0],
								slug: saveSlug,
								source,
								...(logoUrl && { logo_url: logoUrl })
							})
						});
						if (!res.ok) {
							const err = await res.text();
							throw new Error(err || `${res.status}`);
						}
						toast.success(`Logo saved to logos/${saveSlug}.webp`);
						setSlug(saveSlug);
						setCommittedSlug(saveSlug);
						// Bust cache -> re-fetch for all components
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

			{/* Social Studio */}
			{socialStudioOpen && (
				<SocialStudio links={socialLinks} onChange={setSocialLinks} onClose={() => setSocialStudioOpen(false)} />
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

const fuzzyMatch = (query: string, target: string): boolean => {
	let qi = 0;
	for (let ti = 0; ti < target.length && qi < query.length; ti++) {
		if (query[qi] === target[ti]) qi++;
	}
	return qi === query.length;
};

const TagInput = ({
	value,
	onChange,
	allTags,
	currentTags,
	onAdd
}: {
	value: string;
	onChange: (v: string) => void;
	allTags: string[];
	currentTags: string[];
	onAdd: (tags: string[]) => void;
}) => {
	const [focused, setFocused] = useState(false);
	const [highlightIdx, setHighlightIdx] = useState(0);
	const ref = useRef<HTMLDivElement>(null);

	const q = value.trim().toLowerCase();
	const suggestions = q ? allTags.filter((t) => !currentTags.includes(t) && fuzzyMatch(q, t)).slice(0, 8) : [];

	const commit = (tag: string) => {
		const clean = tag.trim().toLowerCase();
		if (clean && !currentTags.includes(clean)) onAdd([clean]);
		onChange('');
		setHighlightIdx(0);
	};

	const commitInput = () => {
		const parts = value
			.split(',')
			.map((s) => s.trim().toLowerCase())
			.filter((s) => s && !currentTags.includes(s));
		if (parts.length > 0) onAdd(parts);
		onChange('');
		setHighlightIdx(0);
	};

	return (
		<div ref={ref} className="relative">
			<input
				value={value}
				onChange={(e) => {
					onChange(e.target.value);
					setHighlightIdx(0);
				}}
				onFocus={() => setFocused(true)}
				onBlur={() => setTimeout(() => setFocused(false), 150)}
				onKeyDown={(e) => {
					if (e.key === 'Enter') {
						e.preventDefault();
						if (suggestions.length > 0 && focused) {
							commit(suggestions[highlightIdx] ?? suggestions[0]);
						} else {
							commitInput();
						}
					} else if (e.key === 'ArrowDown') {
						e.preventDefault();
						setHighlightIdx((i) => Math.min(i + 1, suggestions.length - 1));
					} else if (e.key === 'ArrowUp') {
						e.preventDefault();
						setHighlightIdx((i) => Math.max(i - 1, 0));
					} else if (e.key === 'Escape') {
						(e.target as HTMLInputElement).blur();
					}
				}}
				placeholder="Add tags..."
				className="ed-input text-xs"
			/>
			{focused && suggestions.length > 0 && (
				<div className="absolute left-0 right-0 top-full mt-1 z-10 rounded-lg border border-border bg-surface shadow-lg overflow-hidden">
					{suggestions.map((t, i) => (
						<button
							key={t}
							type="button"
							onMouseDown={(e) => {
								e.preventDefault();
								commit(t);
							}}
							className={`w-full text-left px-3 py-2 text-xs cursor-pointer transition-colors ${i === highlightIdx ? 'bg-accent/10 text-accent' : 'text-foreground hover:bg-muted/50'}`}
						>
							{t}
						</button>
					))}
				</div>
			)}
		</div>
	);
};

const SocialStudio = ({
	links,
	onChange,
	onClose
}: {
	links: Record<string, string>;
	onChange: (v: Record<string, string>) => void;
	onClose: () => void;
}) => {
	const [draft, setDraft] = useState<Record<string, string>>({ ...links });

	const set = (key: string, val: string) => setDraft((p) => ({ ...p, [key]: val }));
	const remove = (key: string) =>
		setDraft((p) => {
			const next = { ...p };
			delete next[key];
			return next;
		});

	const filled = SOCIAL_PLATFORMS.filter((p) => p.key in draft);
	const empty = SOCIAL_PLATFORMS.filter((p) => !(p.key in draft));
	const changed = JSON.stringify(draft) !== JSON.stringify(links);

	const save = () => {
		const clean: Record<string, string> = {};
		for (const [k, v] of Object.entries(draft)) {
			if (v.trim()) clean[k] = v.trim();
		}
		onChange(clean);
		onClose();
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
			<div
				className="bg-surface rounded-2xl border border-border shadow-2xl w-[520px] max-w-[95vw] max-h-[85vh] overflow-hidden flex flex-col"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Header */}
				<div className="flex items-center justify-between px-6 py-4 border-b border-border">
					<div>
						<h2 className="text-base font-bold text-foreground">Social Links</h2>
						<p className="text-xs text-muted-fg mt-0.5">
							{filled.length > 0 ? `${filled.length} platform${filled.length > 1 ? 's' : ''}` : 'No links yet'}
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="size-8 rounded-lg flex items-center justify-center text-muted-fg hover:text-foreground hover:bg-muted cursor-pointer transition-colors"
					>
						{'×'}
					</button>
				</div>

				{/* Body */}
				<div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
					{/* Active links */}
					{filled.length > 0 && (
						<div className="space-y-2.5">
							{filled.map((p) => (
								<div key={p.key} className="group">
									<div className="flex items-center justify-between mb-1.5">
										<span className="text-xs font-semibold text-foreground">{p.label}</span>
										<button
											type="button"
											onClick={() => remove(p.key)}
											className="text-[10px] text-muted-fg/30 hover:text-danger cursor-pointer transition-colors opacity-0 group-hover:opacity-100"
										>
											Remove
										</button>
									</div>
									<input
										value={draft[p.key]}
										onChange={(e) => set(p.key, e.target.value)}
										placeholder={p.placeholder}
										className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-xs font-mono focus:outline-none focus:border-accent transition-colors"
									/>
								</div>
							))}
						</div>
					)}

					{/* Add platforms */}
					{empty.length > 0 && (
						<div>
							<p className="text-[10px] font-bold text-muted-fg uppercase tracking-widest mb-2">Add platform</p>
							<div className="grid grid-cols-3 gap-1.5">
								{empty.map((p) => (
									<button
										key={p.key}
										type="button"
										onClick={() => set(p.key, '')}
										className="rounded-xl border border-dashed border-border py-2.5 text-xs text-muted-fg hover:text-accent hover:border-accent/30 hover:bg-accent/5 cursor-pointer transition-colors"
									>
										{p.label}
									</button>
								))}
							</div>
						</div>
					)}
				</div>

				{/* Footer */}
				<div className="px-6 py-3.5 border-t border-border flex items-center justify-end gap-3">
					<button
						type="button"
						onClick={onClose}
						className="rounded-xl px-4 py-2 text-sm text-muted-fg hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
					>
						Cancel
					</button>
					<button
						type="button"
						disabled={!changed}
						onClick={save}
						className="rounded-xl bg-accent px-6 py-2 text-sm font-bold text-white hover:opacity-90 transition-colors cursor-pointer disabled:opacity-30"
					>
						Save
					</button>
				</div>
			</div>
		</div>
	);
};

export default ServiceEditor;
