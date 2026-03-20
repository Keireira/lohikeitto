'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ContextMenu from '@/components/context-menu';
import type { MenuItem } from '@/components/context-menu';
import { DownloadToast, useDownload } from '@/components/download-toast';
import { s3ArchiveUrl, s3FileUrl } from '@/lib/api';
import type { S3ObjectT } from '@/lib/types';

// ── Utils ──────────────────────────────────────────

const formatSize = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatDate = (iso: string | null): string => {
	if (!iso) return '';
	const d = new Date(iso);
	const day = String(d.getDate()).padStart(2, '0');
	const mon = MONTHS[d.getMonth()];
	const year = d.getFullYear();
	const time = d.toTimeString().slice(0, 8);
	return `${day} ${mon} ${year} ${time}`;
};

const IMAGE_EXTS = new Set(['webp', 'png', 'jpg', 'jpeg', 'svg', 'gif', 'ico']);
const isImage = (name: string): boolean => IMAGE_EXTS.has(name.split('.').pop()?.toLowerCase() ?? '');
const fileIcon = (name: string) => (isImage(name) ? '🖼' : '📄');

const API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? 'http://localhost:1337';

// ── Types ──────────────────────────────────────────

type Entry = { name: string; isDir: boolean; size: number; fullKey: string; lastModified: string | null };
type SortKey = 'name' | 'size' | 'lastModified';
type SortDir = 'asc' | 'desc';
type PreviewData = { src: string; name: string; size: number; lastModified: string | null };

// ── Directory hook ─────────────────────────────────

const useDirectory = (objects: S3ObjectT[], currentPath: string, search: string, sortKey: SortKey, sortDir: SortDir) =>
	useMemo(() => {
		const dirs = new Map<string, number>();
		const files: Entry[] = [];

		for (const obj of objects) {
			if (!obj.key.startsWith(currentPath)) continue;

			const relative = obj.key.slice(currentPath.length);
			if (!relative) continue;

			// Explicit directory placeholder (key ends with /, size 0)
			if (obj.key.endsWith('/') && obj.size === 0) {
				const dirName = relative.replace(/\/$/, '');
				if (dirName && !dirName.includes('/')) {
					dirs.set(dirName, dirs.get(dirName) ?? 0);
				}
				continue;
			}

			const slashIdx = relative.indexOf('/');

			if (slashIdx === -1) {
				files.push({ name: relative, isDir: false, size: obj.size, fullKey: obj.key, lastModified: obj.last_modified });
			} else {
				const dirName = relative.slice(0, slashIdx);
				dirs.set(dirName, (dirs.get(dirName) ?? 0) + obj.size);
			}
		}

		const dirEntries: Entry[] = [...dirs.entries()]
			.map(([name, size]) => ({ name, isDir: true, size, fullKey: `${currentPath}${name}/`, lastModified: null }));

		let all = [...dirEntries, ...files];

		// Search filter
		if (search) {
			const q = search.toLowerCase();
			all = all.filter((e) => e.name.toLowerCase().includes(q));
		}

		// Sort
		const mul = sortDir === 'asc' ? 1 : -1;
		all.sort((a, b) => {
			// Dirs always first
			if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
			switch (sortKey) {
				case 'size':
					return (a.size - b.size) * mul;
				case 'lastModified': {
					const ta = a.lastModified ?? '';
					const tb = b.lastModified ?? '';
					return ta.localeCompare(tb) * mul;
				}
				default:
					return a.name.localeCompare(b.name) * mul;
			}
		});

		return all;
	}, [objects, currentPath, search, sortKey, sortDir]);

// ── Selection hook ─────────────────────────────────

const useSelection = (entries: Entry[]) => {
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const lastClickRef = useRef<number | null>(null);

	const toggle = useCallback((idx: number, e: React.MouseEvent, fromCheckbox = false) => {
		const key = entries[idx].fullKey;

		if (e.shiftKey && lastClickRef.current !== null) {
			// Range select
			const from = Math.min(lastClickRef.current, idx);
			const to = Math.max(lastClickRef.current, idx);
			setSelected((prev) => {
				const next = new Set(prev);
				for (let i = from; i <= to; i++) {
					next.add(entries[i].fullKey);
				}
				return next;
			});
		} else if (fromCheckbox || e.metaKey || e.ctrlKey) {
			// Additive toggle
			setSelected((prev) => {
				const next = new Set(prev);
				if (next.has(key)) {
					next.delete(key);
				} else {
					next.add(key);
				}
				return next;
			});
		} else {
			// Single select
			setSelected(new Set([key]));
		}
		lastClickRef.current = idx;
	}, [entries]);

	const selectAll = useCallback(() => {
		setSelected(new Set(entries.map((e) => e.fullKey)));
	}, [entries]);

	const clear = useCallback(() => {
		setSelected(new Set());
		lastClickRef.current = null;
	}, []);

	// Clear selection when entries change (navigation)
	useEffect(() => clear(), [entries, clear]);

	return { selected, toggle, selectAll, clear };
};

// ── Atoms ──────────────────────────────────────────

const Thumbnail = ({ src }: { src: string }) => (
	<img src={src} alt="" className="size-6 rounded object-cover bg-muted" loading="lazy" />
);

const SortHeader = ({
	label,
	field,
	current,
	dir,
	onSort
}: {
	label: string;
	field: SortKey;
	current: SortKey;
	dir: SortDir;
	onSort: (k: SortKey) => void;
}) => (
	<button
		type="button"
		onClick={() => onSort(field)}
		className="flex items-center gap-1 cursor-pointer select-none hover:text-foreground transition-colors"
	>
		{label}
		{current === field && <span>{dir === 'asc' ? '↑' : '↓'}</span>}
		{current !== field && <span className="opacity-30">{'↕'}</span>}
	</button>
);

// ── Preview modal ──────────────────────────────────

const ImagePreview = ({
	data,
	onClose,
	onPrev,
	onNext,
	onDownload,
	onDelete
}: {
	data: PreviewData;
	onClose: () => void;
	onPrev: (() => void) | null;
	onNext: (() => void) | null;
	onDownload: () => void;
	onDelete: () => void;
}) => {
	const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
	const ext = data.name.split('.').pop()?.toUpperCase() ?? '';

	useEffect(() => { setDims(null); }, [data.src]);

	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
			if ((e.key === 'ArrowUp' || e.key === 'ArrowLeft') && onPrev) onPrev();
			if ((e.key === 'ArrowDown' || e.key === 'ArrowRight') && onNext) onNext();
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [onClose, onPrev, onNext]);

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
			<div className="relative max-w-3xl max-h-[85vh] rounded-lg overflow-hidden bg-background border border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>
				<div className="flex items-center justify-between px-4 py-2 border-b border-border">
					<div className="flex items-center gap-3">
						{onPrev && <button type="button" onClick={onPrev} className="text-muted-fg hover:text-foreground text-sm">{'↑'}</button>}
						{onNext && <button type="button" onClick={onNext} className="text-muted-fg hover:text-foreground text-sm">{'↓'}</button>}
						<span className="text-sm font-mono text-muted-fg">{data.name}</span>
					</div>
					<div className="flex items-center gap-2">
						<button type="button" onClick={onDownload} className="rounded border border-border px-2 py-0.5 text-xs text-muted-fg hover:text-foreground hover:bg-muted transition-colors">{'↓'}</button>
						<button type="button" onClick={onDelete} className="rounded border border-red-400/30 px-2 py-0.5 text-xs text-red-400 hover:bg-red-400/10 transition-colors">{'🗑'}</button>
						<button type="button" onClick={onClose} className="text-muted-fg hover:text-foreground text-sm ml-2">{'esc'}</button>
					</div>
				</div>
				<div className="p-4 flex items-center justify-center" style={{ background: 'repeating-conic-gradient(#80808015 0% 25%, transparent 0% 50%) 50% / 16px 16px' }}>
					<img
						src={data.src}
						alt={data.name}
						className="max-w-full max-h-[60vh] object-contain"
						onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
					/>
				</div>
				<div className="flex flex-wrap gap-x-6 gap-y-1 px-4 py-3 border-t border-border text-xs text-muted-fg font-mono">
					<span>{ext}</span>
					<span>{formatSize(data.size)}</span>
					{dims && <span>{dims.w} x {dims.h}</span>}
					<span>{formatDate(data.lastModified)}</span>
				</div>
			</div>
		</div>
	);
};

// ── Main component ─────────────────────────────────

const S3Browser = ({ data: initialData }: { data: S3ObjectT[] }) => {
	const [data, setData] = useState(initialData);
	const [path, setPath] = useState<string[]>([]);
	const [previewIdx, setPreviewIdx] = useState<number | null>(null);
	const [search, setSearch] = useState('');
	const [sortKey, setSortKey] = useState<SortKey>('name');
	const [sortDir, setSortDir] = useState<SortDir>('asc');
	const [deleting, setDeleting] = useState(false);
	const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; entryIdx: number | null } | null>(null);
	const { state: dlState, start: dlStart, dismiss: dlDismiss } = useDownload();

	const currentPath = path.length > 0 ? `${path.join('/')}/` : '';
	const entries = useDirectory(data, currentPath, search, sortKey, sortDir);
	const { selected, toggle, selectAll, clear } = useSelection(entries);

	const selectedEntries = useMemo(() => entries.filter((e) => selected.has(e.fullKey)), [entries, selected]);
	const selectedSize = useMemo(() => selectedEntries.reduce((a, e) => a + e.size, 0), [selectedEntries]);

	// Image preview navigation
	const imageEntries = useMemo(
		() => entries.map((e, i) => ({ entry: e, idx: i })).filter(({ entry }) => !entry.isDir && isImage(entry.name)),
		[entries]
	);
	const currentImagePos = previewIdx !== null ? imageEntries.findIndex(({ idx }) => idx === previewIdx) : -1;
	const previewData: PreviewData | null = previewIdx !== null && entries[previewIdx]
		? { src: s3FileUrl(entries[previewIdx].fullKey), name: entries[previewIdx].name, size: entries[previewIdx].size, lastModified: entries[previewIdx].lastModified }
		: null;
	const goPrevImage = useCallback(() => { if (currentImagePos > 0) setPreviewIdx(imageEntries[currentImagePos - 1].idx); }, [currentImagePos, imageEntries]);
	const goNextImage = useCallback(() => { if (currentImagePos < imageEntries.length - 1) setPreviewIdx(imageEntries[currentImagePos + 1].idx); }, [currentImagePos, imageEntries]);

	const totalFiles = data.filter((o) => !o.key.endsWith('/') && o.size > 0).length;
	const totalBytes = data.reduce((a, o) => a + o.size, 0);

	const openDir = (name: string) => { setPath((p) => [...p, name]); setSearch(''); };
	const goUp = () => { setPath((p) => p.slice(0, -1)); setSearch(''); };
	const goTo = (idx: number) => { setPath((p) => p.slice(0, idx + 1)); setSearch(''); };

	const toggleSort = (key: SortKey) => {
		if (sortKey === key) {
			setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
		} else {
			setSortKey(key);
			setSortDir('asc');
		}
	};

	const handleDelete = async () => {
		if (selected.size === 0) return;
		// Expand directory keys to include all their contents
		const allKeys = new Set<string>();
		for (const key of selected) {
			if (key.endsWith('/')) {
				for (const obj of data) {
					if (obj.key.startsWith(key)) allKeys.add(obj.key);
				}
			}
			allKeys.add(key);
		}
		const keys = [...allKeys];
		if (!window.confirm(`Delete ${selected.size} item${selected.size > 1 ? 's' : ''}?`)) return;

		setDeleting(true);
		try {
			const res = await fetch(`${API_URL}/s3/delete`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(keys)
			});
			if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
			setData((prev) => prev.filter((o) => !keys.includes(o.key)));
			clear();
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Delete failed');
		} finally {
			setDeleting(false);
		}
	};

	const handleDownloadSelected = () => {
		if (selectedEntries.length === 1 && !selectedEntries[0].isDir) {
			dlStart(s3FileUrl(selectedEntries[0].fullKey), selectedEntries[0].name);
		} else {
			dlStart(s3ArchiveUrl(currentPath), `${path[path.length - 1] ?? 's3'}-selection.zip`);
		}
	};

	const handleCopyMove = async (move_: boolean) => {
		if (selected.size === 0) return;
		const dest = window.prompt(`${move_ ? 'Move' : 'Copy'} to directory:`, currentPath);
		if (dest === null) return;

		try {
			const res = await fetch(`${API_URL}/s3/copy`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ keys: [...selected], destination: dest, delete_source: move_ })
			});
			if (!res.ok) throw new Error(`${move_ ? 'Move' : 'Copy'} failed: ${res.status}`);

			// Refresh data
			const listRes = await fetch(`${API_URL}/s3`, { cache: 'no-store' });
			if (listRes.ok) setData(await listRes.json());
			clear();
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Operation failed');
		}
	};

	const handleMkdir = async () => {
		const name = window.prompt('New directory name:');
		if (!name) return;

		try {
			const res = await fetch(`${API_URL}/s3/mkdir`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: `${currentPath}${name}` })
			});
			if (!res.ok) throw new Error(`Create directory failed: ${res.status}`);
			const result = await res.json();
			setData((prev) => [...prev, { key: result.created, size: 0, last_modified: null }]);
		} catch (e) {
			alert(e instanceof Error ? e.message : 'Create directory failed');
		}
	};

	const handleUpload = async (files: FileList) => {
		for (const file of files) {
			const key = `${currentPath}${file.name}`;
			try {
				const res = await fetch(`${API_URL}/s3/upload/${encodeURIComponent(key)}`, {
					method: 'PUT',
					body: await file.arrayBuffer()
				});
				if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
				setData((prev) => [
					...prev.filter((o) => o.key !== key),
					{ key, size: file.size, last_modified: new Date().toISOString() }
				]);
			} catch (e) {
				alert(e instanceof Error ? e.message : `Upload failed: ${file.name}`);
			}
		}
	};

	const fileInputRef = useRef<HTMLInputElement>(null);

	const allSelected = entries.length > 0 && entries.every((e) => selected.has(e.fullKey));

	const buildContextMenu = (entryIdx: number | null): MenuItem[] => {
		const entry = entryIdx !== null ? entries[entryIdx] : null;
		const hasSelection = selected.size > 0;
		const items: MenuItem[] = [];

		if (entry) {
			const selectIfNeeded = () => { if (!hasSelection) toggle(entryIdx!, { metaKey: false, ctrlKey: false, shiftKey: false } as React.MouseEvent); };

			if (entry.isDir) {
				items.push({ label: 'Open', icon: '📁', onClick: () => openDir(entry.name) });
			}

			items.push(
				{
					label: entry.isDir ? 'Download as zip' : 'Download',
					icon: '↓',
					onClick: () => entry.isDir
						? dlStart(s3ArchiveUrl(entry.fullKey), `${entry.name}.zip`)
						: dlStart(s3FileUrl(entry.fullKey), entry.name)
				},
				{ label: 'Copy to...', icon: '📋', onClick: () => { selectIfNeeded(); handleCopyMove(false); } },
				{ label: 'Move to...', icon: '📦', onClick: () => { selectIfNeeded(); handleCopyMove(true); } }
			);

			if (!entry.isDir && isImage(entry.name)) {
				items.push({ label: 'Preview', icon: '👁', onClick: () => setPreviewIdx(entryIdx!) });
			}

			items.push(
				{ label: '', icon: '', separator: true, onClick: () => {} },
				{ label: 'Delete', icon: '🗑', danger: true, onClick: async () => {
					if (!window.confirm(`Delete ${entry.name}${entry.isDir ? '/ and all contents' : ''}?`)) return;
					const keysToDelete = entry.isDir
						? data.filter((o) => o.key.startsWith(entry.fullKey)).map((o) => o.key)
						: [entry.fullKey];
					try {
						const res = await fetch(`${API_URL}/s3/delete`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(keysToDelete) });
						if (!res.ok) throw new Error('Delete failed');
						setData((prev) => prev.filter((o) => !keysToDelete.includes(o.key)));
					} catch (e) { alert(e instanceof Error ? e.message : 'Delete failed'); }
				}}
			);
		}

		if (hasSelection) {
			if (entry) items.push({ label: '', icon: '', separator: true, onClick: () => {} });
			items.push(
				{ label: `Download ${selected.size} selected`, icon: '↓', onClick: handleDownloadSelected },
				{ label: 'Copy selected to...', icon: '📋', onClick: () => handleCopyMove(false) },
				{ label: 'Move selected to...', icon: '📦', onClick: () => handleCopyMove(true) },
				{ label: '', icon: '', separator: true, onClick: () => {} },
				{ label: `Delete ${selected.size} selected`, icon: '🗑', danger: true, onClick: handleDelete }
			);
		}

		// Always available
		if (items.length > 0) {
			items.push({ label: '', icon: '', separator: true, onClick: () => {} });
		}
		items.push(
			{ label: 'Upload files', icon: '↑', onClick: () => fileInputRef.current?.click() },
			{ label: 'New folder', icon: '📁', onClick: handleMkdir }
		);
		if (hasSelection) {
			items.push({ label: 'Clear selection', icon: '✕', onClick: clear });
		}
		items.push({ label: 'Select all', icon: '☑', onClick: selectAll });

		return items;
	};

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-xl font-semibold tracking-tight">S3 Bucket</h2>
					<p className="mt-1 text-sm text-muted-fg">
						{totalFiles} files, {formatSize(totalBytes)} total
					</p>
				</div>
				<button
					type="button"
					onClick={() => dlStart(s3ArchiveUrl(), 's3-backup.zip')}
					className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors cursor-pointer"
				>
					Download All
				</button>
			</div>

			{/* Toolbar */}
			<div className="space-y-3">
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-4">
						<div className="flex items-center gap-1 text-sm font-mono">
							<button type="button" onClick={() => { setPath([]); setSearch(''); }} className="text-muted-fg hover:text-foreground transition-colors">/</button>
							{path.map((segment, i) => (
								<span key={segment} className="flex items-center gap-1">
									<span className="text-muted-fg/50">/</span>
									<button type="button" onClick={() => goTo(i)} className={`hover:text-foreground transition-colors ${i === path.length - 1 ? 'text-foreground font-medium' : 'text-muted-fg'}`}>{segment}</button>
								</span>
							))}
						</div>
						<input
							type="text"
							placeholder="Search..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="rounded-md border border-border bg-background px-3 py-1.5 text-sm placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-accent/50 w-48"
						/>
					</div>

					<div className="flex items-center gap-2">
						<input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) handleUpload(e.target.files); e.target.value = ''; }} />
						<button type="button" onClick={() => fileInputRef.current?.click()} className="rounded border border-border px-2.5 py-1 text-xs text-muted-fg hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
							{'↑ Upload'}
						</button>
						<button type="button" onClick={handleMkdir} className="rounded border border-border px-2.5 py-1 text-xs text-muted-fg hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
							{'📁 New folder'}
						</button>
					</div>
				</div>

				{selected.size > 0 && (
					<div className="flex items-center gap-2 bg-muted/50 rounded-md px-3 py-2">
						<span className="text-xs text-muted-fg mr-1">
							{selected.size} selected ({formatSize(selectedSize)})
						</span>
						<button type="button" onClick={handleDownloadSelected} className="rounded border border-border px-2.5 py-1 text-xs text-muted-fg hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
							{'↓ Download'}
						</button>
						<button type="button" onClick={() => handleCopyMove(false)} className="rounded border border-border px-2.5 py-1 text-xs text-muted-fg hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
							{'Copy to...'}
						</button>
						<button type="button" onClick={() => handleCopyMove(true)} className="rounded border border-border px-2.5 py-1 text-xs text-muted-fg hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
							{'Move to...'}
						</button>
						<button
							type="button"
							onClick={handleDelete}
							disabled={deleting}
							className="rounded border border-red-400/30 px-2.5 py-1 text-xs text-red-400 hover:bg-red-400/10 transition-colors cursor-pointer disabled:opacity-50"
						>
							{deleting ? 'Deleting...' : '🗑 Delete'}
						</button>
						<div className="flex-1" />
						<button type="button" onClick={clear} className="rounded border border-border px-2.5 py-1 text-xs text-muted-fg hover:text-foreground hover:bg-muted transition-colors cursor-pointer">
							Clear selection
						</button>
					</div>
				)}
			</div>

			{/* Table */}
			<div
				className="overflow-hidden rounded-lg border border-border"
				onContextMenu={(e) => {
					if ((e.target as HTMLElement).closest('tr')) return;
					e.preventDefault();
					setCtxMenu({ x: e.clientX, y: e.clientY, entryIdx: null });
				}}
			>
				<table className="w-full text-base">
					<thead>
						<tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-fg">
							<th className="px-2 py-2.5 w-8">
								<input
									type="checkbox"
									checked={allSelected}
									onChange={() => allSelected ? clear() : selectAll()}
									className="cursor-pointer accent-accent"
								/>
							</th>
							<th className="px-4 py-2.5 font-medium"><SortHeader label="Name" field="name" current={sortKey} dir={sortDir} onSort={toggleSort} /></th>
							<th className="px-4 py-2.5 font-medium text-right w-32"><SortHeader label="Size" field="size" current={sortKey} dir={sortDir} onSort={toggleSort} /></th>
							<th className="px-4 py-2.5 font-medium w-52"><SortHeader label="Modified" field="lastModified" current={sortKey} dir={sortDir} onSort={toggleSort} /></th>
							<th className="px-4 py-2.5 font-medium text-center w-16" />
						</tr>
					</thead>
					<tbody>
						{path.length > 0 && (
							<tr className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer" onClick={goUp}>
								<td />
								<td className="px-4 py-2.5"><div className="flex items-center gap-2"><span>📁</span><span className="text-muted-fg">..</span></div></td>
								<td /><td /><td />
							</tr>
						)}

						{entries.map((entry, entryIdx) => {
							const imgFile = !entry.isDir && isImage(entry.name);
							const fileUrl = imgFile ? s3FileUrl(entry.fullKey) : '';
							const isSelected = selected.has(entry.fullKey);

							const hasSelection = selected.size > 0;

							return (
								<tr
									key={entry.fullKey}
									className={`border-b border-border hover:bg-muted/50 transition-colors cursor-pointer select-none ${isSelected ? 'bg-accent/5' : ''}`}
									onContextMenu={(e) => {
										e.preventDefault();
										setCtxMenu({ x: e.clientX, y: e.clientY, entryIdx });
									}}
									onClick={(e) => {
										// Modifier keys or active selection → toggle
										if (hasSelection || e.metaKey || e.ctrlKey || e.shiftKey) {
											toggle(entryIdx, e);
											return;
										}
										if (entry.isDir) {
											openDir(entry.name);
										} else if (imgFile) {
											setPreviewIdx(entryIdx);
										}
									}}
								>
									<td
									className="px-2 py-2.5 w-10"
									onClick={(e) => {
										e.stopPropagation();
										toggle(entryIdx, e, true);
									}}
								>
										<div className="flex items-center justify-center size-8 cursor-pointer">
											<input
												type="checkbox"
												checked={isSelected}
												readOnly
												className="cursor-pointer accent-accent pointer-events-none"
											/>
										</div>
									</td>
									<td className="px-4 py-2.5">
										<div className="flex items-center gap-2">
											{imgFile ? <Thumbnail src={fileUrl} /> : <span>{entry.isDir ? '📁' : fileIcon(entry.name)}</span>}
											<span className={entry.isDir ? 'font-medium' : 'font-mono text-sm'}>
												{entry.name}{entry.isDir ? '/' : ''}
											</span>
										</div>
									</td>
									<td className="px-4 py-2.5 text-right text-muted-fg font-mono text-sm">{formatSize(entry.size)}</td>
									<td className="px-4 py-2.5 text-muted-fg text-xs">{formatDate(entry.lastModified)}</td>
									<td className="px-4 py-2.5 text-center">
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												if (entry.isDir) {
													dlStart(s3ArchiveUrl(entry.fullKey), `${entry.name}.zip`);
												} else {
													dlStart(s3FileUrl(entry.fullKey), entry.name);
												}
											}}
											className="rounded border border-border px-2 py-0.5 text-xs text-muted-fg hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
										>
											{'↓'}
										</button>
									</td>
								</tr>
							);
						})}

						{entries.length === 0 && (
							<tr><td colSpan={5} className="px-4 py-12 text-center text-muted-fg">{search ? 'No matches' : 'Empty directory'}</td></tr>
						)}
					</tbody>
				</table>
			</div>

			{previewData && previewIdx !== null && (
				<ImagePreview
					data={previewData}
					onClose={() => setPreviewIdx(null)}
					onPrev={currentImagePos > 0 ? goPrevImage : null}
					onNext={currentImagePos < imageEntries.length - 1 ? goNextImage : null}
					onDownload={() => dlStart(s3FileUrl(entries[previewIdx].fullKey), entries[previewIdx].name)}
					onDelete={async () => {
						const key = entries[previewIdx].fullKey;
						if (!window.confirm(`Delete ${entries[previewIdx].name}?`)) return;
						try {
							const res = await fetch(`${API_URL}/s3/delete`, {
								method: 'DELETE',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify([key])
							});
							if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
							setData((prev) => prev.filter((o) => o.key !== key));
							// Move to next image or close
							if (goNextImage && currentImagePos < imageEntries.length - 1) {
								goNextImage();
							} else if (goPrevImage && currentImagePos > 0) {
								goPrevImage();
							} else {
								setPreviewIdx(null);
							}
						} catch (e) {
							alert(e instanceof Error ? e.message : 'Delete failed');
						}
					}}
				/>
			)}

			{ctxMenu && (
				<ContextMenu
					x={ctxMenu.x}
					y={ctxMenu.y}
					items={buildContextMenu(ctxMenu.entryIdx)}
					onClose={() => setCtxMenu(null)}
				/>
			)}

			<DownloadToast state={dlState} onDismiss={dlDismiss} />
		</div>
	);
};

export default S3Browser;
