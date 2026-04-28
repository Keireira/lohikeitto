'use client';

import { useEffect, useRef, useState } from 'react';
import { useDebouncedState } from '@tanstack/react-pacer';
import { useRouter, useSearchParams } from 'next/navigation';
import type { MenuItem } from '@/components/context-menu';
import ContextMenu from '@/components/context-menu';
import DirPicker from '@/components/dir-picker';
import { API_URL, s3ArchiveUrl, s3FileUrl } from '@/lib/api';
import { formatDate, formatSize } from '@/lib/format';
import { toast } from '@/lib/toast';
import type { S3ObjectT, ServiceT } from '@/lib/types';
import useGlobalDownload from '@/lib/use-download';
import { computeDirectory } from './compute-directory';
import ImagePreview from './image-preview';
import type { PreviewData, SortKey, SortDir } from './s3-browser.d';
import SortHeader from './sort-header';
import { clearImageCache } from './thumb-cache';
import Thumbnail from './thumbnail';
import { useSelection } from './use-selection';

const IMAGE_EXTS = new Set(['webp', 'png', 'jpg', 'jpeg', 'svg', 'gif', 'ico']);
const isImage = (name: string): boolean => IMAGE_EXTS.has(name.split('.').pop()?.toLowerCase() ?? '');

const S3Browser = ({ data: initialData, services }: { data: S3ObjectT[]; services: ServiceT[] }) => {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [data, setData] = useState(initialData);
	const [path, setPath] = useState<string[]>(() => {
		const p = searchParams.get('path');
		return p ? p.split('/').filter(Boolean) : [];
	});
	const [previewIdx, setPreviewIdx] = useState<number | null>(null);
	const [searchInput, setSearchInput] = useState('');
	const [search, setSearch] = useDebouncedState('', { wait: 200 });
	const [sortKey, setSortKey] = useState<SortKey>('name');
	const [sortDir, setSortDir] = useState<SortDir>('asc');
	const [deleting, setDeleting] = useState(false);
	const [copyMoveMode, setCopyMoveMode] = useState<'copy' | 'move' | null>(null);
	const [cacheKey, setCacheKey] = useState(0);

	const handleClearCache = async () => {
		await clearImageCache();
		setCacheKey((k) => k + 1);
	};
	const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; entryIdx: number | null } | null>(null);
	const { start: dlStart, startFile: dlStartFile, startKeys: dlStartKeys } = useGlobalDownload();

	const currentPath = path.length > 0 ? `${path.join('/')}/` : '';

	// Sync path -> URL
	useEffect(() => {
		const params = new URLSearchParams();
		if (path.length > 0) params.set('path', path.join('/'));
		const qs = params.toString();
		router.replace(qs ? `/s3?${qs}` : '/s3', { scroll: false });
	}, [path, router]);
	const entries = computeDirectory(data, currentPath, search, sortKey, sortDir);
	const { selected, toggle, selectAll, clear } = useSelection(entries);

	const selectedEntries = entries.filter((e) => selected.has(e.fullKey));
	const selectedSize = selectedEntries.reduce((a, e) => a + e.size, 0);

	// Logo ↔ Service linking
	const isLogosDir = currentPath === 'logos/';
	const slugToService = new Map<string, ServiceT>();
	for (const s of services) slugToService.set(s.slug, s);
	const unlinkedLogos = isLogosDir
		? entries.filter((e) => !e.isDir && !slugToService.has(e.name.replace(/\.[^.]+$/, '')))
		: [];

	// Image preview navigation
	const imageEntries = entries
		.map((e, i) => ({ entry: e, idx: i }))
		.filter(({ entry }) => !entry.isDir && isImage(entry.name));
	const currentImagePos = previewIdx !== null ? imageEntries.findIndex(({ idx }) => idx === previewIdx) : -1;
	const previewData: PreviewData | null =
		previewIdx !== null && entries[previewIdx]
			? {
					src: s3FileUrl(entries[previewIdx].fullKey),
					name: entries[previewIdx].name,
					size: entries[previewIdx].size,
					lastModified: entries[previewIdx].lastModified
				}
			: null;
	const goPrevImage = () => {
		if (currentImagePos > 0) setPreviewIdx(imageEntries[currentImagePos - 1].idx);
	};
	const goNextImage = () => {
		if (currentImagePos < imageEntries.length - 1) setPreviewIdx(imageEntries[currentImagePos + 1].idx);
	};

	const totalFiles = data.filter((o) => !o.key.endsWith('/') && o.size > 0).length;
	const totalBytes = data.reduce((a, o) => a + o.size, 0);

	const clearSearch = () => {
		setSearchInput('');
		setSearch('');
	};
	const openDir = (name: string) => {
		setPath((p) => [...p, name]);
		clearSearch();
	};
	const goUp = () => {
		setPath((p) => p.slice(0, -1));
		clearSearch();
	};
	const goTo = (idx: number) => {
		setPath((p) => p.slice(0, idx + 1));
		clearSearch();
	};

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
			toast.error(e instanceof Error ? e.message : 'Delete failed');
		} finally {
			setDeleting(false);
		}
	};

	const handleDownloadSelected = () => {
		if (selectedEntries.length === 1 && !selectedEntries[0].isDir) {
			dlStartFile(s3FileUrl(selectedEntries[0].fullKey), selectedEntries[0].name);
		} else if (selectedEntries.length === 1 && selectedEntries[0].isDir) {
			dlStart(s3ArchiveUrl(selectedEntries[0].fullKey), `${selectedEntries[0].name}.zip`);
		} else {
			// Multiple selected — collect all keys and archive together
			const keys: string[] = [];
			for (const entry of selectedEntries) {
				if (entry.isDir) {
					// Include all files under this dir
					for (const obj of data) {
						if (obj.key.startsWith(entry.fullKey) && !obj.key.endsWith('/') && obj.size > 0) {
							keys.push(obj.key);
						}
					}
				} else {
					keys.push(entry.fullKey);
				}
			}
			dlStartKeys(keys, 'selection.zip');
		}
	};

	const openCopyMove = (mode: 'copy' | 'move') => {
		if (selected.size === 0) return;
		setCopyMoveMode(mode);
	};

	const executeCopyMove = async (dest: string) => {
		const mode = copyMoveMode;
		setCopyMoveMode(null);
		if (!mode) return;

		try {
			const res = await fetch(`${API_URL}/s3/copy`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ keys: [...selected], destination: dest, delete_source: mode === 'move' })
			});
			if (!res.ok) throw new Error(`${mode} failed: ${res.status}`);

			const listRes = await fetch(`${API_URL}/s3`, { cache: 'no-store' });
			if (listRes.ok) setData(await listRes.json());
			clear();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Operation failed');
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
			toast.error(e instanceof Error ? e.message : 'Create directory failed');
		}
	};

	const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);

	const handleUpload = async (files: FileList) => {
		const fileArr = Array.from(files);
		if (fileArr.length === 0) return;
		setUploading({ done: 0, total: fileArr.length });
		const failed: string[] = [];

		// Upload in parallel batches of 4
		const BATCH = 4;
		for (let i = 0; i < fileArr.length; i += BATCH) {
			const batch = fileArr.slice(i, i + BATCH);
			const results = await Promise.allSettled(
				batch.map(async (file) => {
					const key = `${currentPath}${file.name}`;
					const res = await fetch(`${API_URL}/s3/upload/${encodeURIComponent(key)}`, {
						method: 'PUT',
						body: await file.arrayBuffer()
					});
					if (!res.ok) throw new Error(`${res.status}`);
					return { key, size: file.size };
				})
			);
			for (let j = 0; j < results.length; j++) {
				const r = results[j];
				if (r.status === 'fulfilled') {
					setData((prev) => [
						...prev.filter((o) => o.key !== r.value.key),
						{ key: r.value.key, size: r.value.size, last_modified: new Date().toISOString() }
					]);
				} else {
					failed.push(batch[j].name);
				}
			}
			setUploading({ done: Math.min(i + BATCH, fileArr.length), total: fileArr.length });
		}

		setUploading(null);
		if (failed.length > 0) toast.error(`Failed to upload: ${failed.join(', ')}`);
	};

	const fileInputRef = useRef<HTMLInputElement>(null);

	const allSelected = entries.length > 0 && entries.every((e) => selected.has(e.fullKey));

	const buildContextMenu = (entryIdx: number | null): MenuItem[] => {
		const entry = entryIdx !== null ? entries[entryIdx] : null;
		const hasSelection = selected.size > 0;
		const items: MenuItem[] = [];

		if (entry) {
			const selectIfNeeded = () => {
				if (!hasSelection) toggle(entryIdx!, { metaKey: false, ctrlKey: false, shiftKey: false } as React.MouseEvent);
			};

			if (entry.isDir) {
				items.push({ label: 'Open', icon: '📁', onClick: () => openDir(entry.name) });
			}

			items.push(
				{
					label: entry.isDir ? 'Download as zip' : 'Download',
					icon: '↓',
					onClick: () =>
						entry.isDir
							? dlStart(s3ArchiveUrl(entry.fullKey), `${entry.name}.zip`)
							: dlStartFile(s3FileUrl(entry.fullKey), entry.name)
				},
				{
					label: 'Copy to...',
					icon: '📋',
					onClick: () => {
						selectIfNeeded();
						openCopyMove('copy');
					}
				},
				{
					label: 'Move to...',
					icon: '📦',
					onClick: () => {
						selectIfNeeded();
						openCopyMove('move');
					}
				}
			);

			if (!entry.isDir && isImage(entry.name)) {
				items.push({ label: 'Preview', icon: '👁', onClick: () => setPreviewIdx(entryIdx!) });
			}

			items.push(
				{ label: '', icon: '', separator: true, onClick: () => {} },
				{
					label: 'Delete',
					icon: '🗑',
					danger: true,
					onClick: async () => {
						if (!window.confirm(`Delete ${entry.name}${entry.isDir ? '/ and all contents' : ''}?`)) return;
						const keysToDelete = entry.isDir
							? data.filter((o) => o.key.startsWith(entry.fullKey)).map((o) => o.key)
							: [entry.fullKey];
						try {
							const res = await fetch(`${API_URL}/s3/delete`, {
								method: 'DELETE',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify(keysToDelete)
							});
							if (!res.ok) throw new Error('Delete failed');
							setData((prev) => prev.filter((o) => !keysToDelete.includes(o.key)));
						} catch (e) {
							toast.error(e instanceof Error ? e.message : 'Delete failed');
						}
					}
				}
			);
		}

		// Show "selected" actions only when multiple items selected, or when right-clicking empty space
		const showSelectedActions = hasSelection && (selected.size > 1 || !entry || !selected.has(entry.fullKey));
		if (showSelectedActions) {
			if (entry) items.push({ label: '', icon: '', separator: true, onClick: () => {} });
			items.push(
				{ label: `Download ${selected.size} selected`, icon: '↓', onClick: handleDownloadSelected },
				{ label: 'Copy selected to...', icon: '📋', onClick: () => openCopyMove('copy') },
				{ label: 'Move selected to...', icon: '📦', onClick: () => openCopyMove('move') },
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

	const [dragOver, setDragOver] = useState(false);

	const handleDrop = (e: React.DragEvent) => {
		e.preventDefault();
		setDragOver(false);
		if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files);
	};

	return (
		<div
			className={`space-y-4 relative ${dragOver ? 'ring-2 ring-accent ring-inset rounded-2xl' : ''}`}
			onDragOver={(e) => {
				e.preventDefault();
				setDragOver(true);
			}}
			onDragLeave={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
			}}
			onDrop={handleDrop}
		>
			{dragOver && (
				<div className="absolute inset-0 z-10 flex items-center justify-center bg-accent/5 rounded-2xl pointer-events-none">
					<p className="text-accent font-bold text-lg">Drop files to upload</p>
				</div>
			)}
			{uploading && (
				<div className="flex items-center gap-3 rounded-xl bg-accent/5 border border-accent/20 px-4 py-3">
					<div className="flex-1 h-1.5 rounded-full bg-accent/20 overflow-hidden">
						<div
							className="h-full bg-accent rounded-full transition-all"
							style={{ width: `${(uploading.done / uploading.total) * 100}%` }}
						/>
					</div>
					<span className="text-xs text-accent font-medium whitespace-nowrap">
						{uploading.done}/{uploading.total} uploaded
					</span>
				</div>
			)}
			{/* Toolbar — sticky */}
			<div className="sticky top-[72px] z-20 bg-background py-3 space-y-3 -mx-8 px-8">
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-3">
						{path.length > 0 && (
							<button
								type="button"
								onClick={goUp}
								className="rounded-lg border border-border size-7 flex items-center justify-center text-xs text-muted-fg hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
								title="Go back"
							>
								{'←'}
							</button>
						)}
						<div className="flex items-center gap-0.5 text-sm font-mono">
							<button
								type="button"
								onClick={() => {
									setPath([]);
									clearSearch();
								}}
								className="text-muted-fg hover:text-foreground transition-colors"
							>
								/
							</button>
							{path.map((segment, i) => (
								<span key={`${segment}-${i}`} className="flex items-center gap-0.5">
									{i > 0 && <span className="text-muted-fg/30">/</span>}
									<button
										type="button"
										onClick={() => goTo(i)}
										className={`hover:text-foreground transition-colors ${i === path.length - 1 ? 'text-foreground font-medium' : 'text-muted-fg'}`}
									>
										{segment}
									</button>
								</span>
							))}
						</div>
						<div className="relative">
							<input
								type="text"
								placeholder="Search..."
								value={searchInput}
								onChange={(e) => {
									setSearchInput(e.target.value);
									setSearch(e.target.value);
								}}
								className="rounded-full border border-border bg-surface pl-4 pr-8 py-2 text-sm placeholder:text-muted-fg focus:outline-none focus:ring-2 focus:ring-accent/50 w-56"
							/>
							{searchInput && (
								<button
									type="button"
									onClick={clearSearch}
									className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-fg hover:text-foreground text-xs cursor-pointer"
								>
									{'✕'}
								</button>
							)}
						</div>
					</div>

					<div className="flex items-center gap-2">
						<input
							ref={fileInputRef}
							type="file"
							multiple
							className="hidden"
							onChange={(e) => {
								if (e.target.files) handleUpload(e.target.files);
								e.target.value = '';
							}}
						/>
						<button
							type="button"
							onClick={handleClearCache}
							title="Refresh thumbnail cache"
							className="rounded-full border border-border size-8 flex items-center justify-center text-xs text-muted-fg hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
						>
							{'↻'}
						</button>
						<button
							type="button"
							onClick={handleMkdir}
							className="rounded-full border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
						>
							{'📁 New folder'}
						</button>
						<button
							type="button"
							onClick={() => fileInputRef.current?.click()}
							className="rounded-full bg-foreground px-4 py-2 text-xs font-bold text-background hover:opacity-90 transition-colors cursor-pointer"
						>
							{'↑ Upload'}
						</button>
						<button
							type="button"
							onClick={() =>
								dlStart(s3ArchiveUrl(currentPath || undefined), `${path[path.length - 1] ?? 'bucket'}.zip`)
							}
							className="rounded-full bg-accent px-4 py-2 text-xs font-bold text-white shadow-sm hover:opacity-90 transition-colors cursor-pointer"
						>
							{`↓ Download ${currentPath ? path[path.length - 1] : 'All'}`}
						</button>
					</div>
				</div>
			</div>

			{/* Unlinked logos warning */}
			{isLogosDir && unlinkedLogos.length > 0 && (
				<div className="flex items-center gap-3 rounded-xl bg-danger/5 border border-danger/20 px-4 py-3">
					<span className="text-danger text-sm">{'⚠'}</span>
					<span className="text-xs text-danger font-medium flex-1">
						{unlinkedLogos.length} logo{unlinkedLogos.length > 1 ? 's' : ''} not linked to any service
					</span>
					<div className="flex items-center gap-1.5 flex-wrap">
						{unlinkedLogos.slice(0, 5).map((e) => {
							const slug = e.name.replace(/\.[^.]+$/, '');
							return (
								<a
									key={e.fullKey}
									href={`/?mode=create&slug=${encodeURIComponent(slug)}`}
									className="rounded-lg bg-danger/10 px-2.5 py-1 text-[11px] font-mono text-danger hover:bg-danger/20 transition-colors"
								>
									{slug}
								</a>
							);
						})}
						{unlinkedLogos.length > 5 && (
							<span className="text-[11px] text-danger/60">+{unlinkedLogos.length - 5} more</span>
						)}
					</div>
				</div>
			)}

			{/* Table */}
			<div
				className="overflow-hidden rounded-2xl bg-surface border border-border"
				onContextMenu={(e) => {
					if ((e.target as HTMLElement).closest('tr')) return;
					e.preventDefault();
					setCtxMenu({ x: e.clientX, y: e.clientY, entryIdx: null });
				}}
			>
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b border-border bg-muted/30 text-left text-xs uppercase tracking-wider text-muted-fg">
							<th className="pl-3 pr-1 py-4 w-10">
								<input
									type="checkbox"
									checked={allSelected}
									onChange={() => (allSelected ? clear() : selectAll())}
									className="cursor-pointer accent-accent"
								/>
							</th>
							<th className="px-4 py-4 font-medium">
								<SortHeader label="Name" field="name" current={sortKey} dir={sortDir} onSort={toggleSort} />
							</th>
							<th className="px-4 py-4 font-medium w-28">
								<div className="flex justify-end">
									<SortHeader label="Size" field="size" current={sortKey} dir={sortDir} onSort={toggleSort} />
								</div>
							</th>
							<th className="px-4 py-4 font-medium w-48">
								<SortHeader label="Modified" field="lastModified" current={sortKey} dir={sortDir} onSort={toggleSort} />
							</th>
							<th className="py-4 w-12" />
						</tr>
					</thead>
					<tbody>
						{path.length > 0 && (
							<tr className="border-b border-border hover:bg-muted/50 transition-colors cursor-pointer" onClick={goUp}>
								<td />
								<td className="px-4 py-3">
									<div className="flex items-center gap-3">
										<span className="text-lg">📁</span>
										<span className="text-muted-fg">..</span>
									</div>
								</td>
								<td />
								<td />
								<td />
							</tr>
						)}

						{entries.map((entry, entryIdx) => {
							const imgFile = !entry.isDir && isImage(entry.name);
							const isSelected = selected.has(entry.fullKey);
							const hasSelection = selected.size > 0;
							const logoSlug = isLogosDir && !entry.isDir ? entry.name.replace(/\.[^.]+$/, '') : null;
							const linkedService = logoSlug ? slugToService.get(logoSlug) : null;

							return (
								<tr
									key={entry.fullKey}
									className={`border-b border-border hover:bg-muted/50 transition-colors cursor-pointer select-none ${isSelected ? 'bg-accent/5' : ''}`}
									onContextMenu={(e) => {
										e.preventDefault();
										setCtxMenu({ x: e.clientX, y: e.clientY, entryIdx });
									}}
									onClick={(e) => {
										if (hasSelection || e.metaKey || e.ctrlKey || e.shiftKey) {
											toggle(entryIdx, e);
											return;
										}
										if (entry.isDir) openDir(entry.name);
										else if (imgFile) setPreviewIdx(entryIdx);
									}}
								>
									<td
										className="pl-3 pr-1 py-3 w-10"
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
									<td className="px-4 py-3">
										<div className="flex items-center gap-3">
											{imgFile ? (
												<Thumbnail fileKey={entry.fullKey} key={`${entry.fullKey}-${cacheKey}`} />
											) : (
												<span className="text-lg">{entry.isDir ? '📁' : '📄'}</span>
											)}
											<span className={entry.isDir ? 'font-medium' : 'font-mono text-sm'}>
												{entry.name}
												{entry.isDir ? '/' : ''}
											</span>
											{logoSlug && linkedService && (
												<a
													href={`/?mode=edit&id=${linkedService.id}`}
													onClick={(e) => e.stopPropagation()}
													className="rounded-md bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success hover:bg-success/20 transition-colors"
													title={linkedService.name}
												>
													{linkedService.name}
												</a>
											)}
											{logoSlug && !linkedService && (
												<a
													href={`/?mode=create&slug=${encodeURIComponent(logoSlug)}`}
													onClick={(e) => e.stopPropagation()}
													className="rounded-md bg-danger/10 px-2 py-0.5 text-[10px] font-medium text-danger hover:bg-danger/20 transition-colors"
												>
													unlinked
												</a>
											)}
										</div>
									</td>
									<td className="px-4 py-3 text-right text-muted-fg font-mono text-sm">{formatSize(entry.size)}</td>
									<td className="px-4 py-3 text-muted-fg text-xs">{formatDate(entry.lastModified)}</td>
									<td className="px-4 py-3 text-center">
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												setCtxMenu({
													x: e.currentTarget.getBoundingClientRect().right,
													y: e.currentTarget.getBoundingClientRect().bottom,
													entryIdx
												});
											}}
											className="rounded-lg size-7 flex items-center justify-center text-sm text-muted-fg hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
										>
											{'⋮'}
										</button>
									</td>
								</tr>
							);
						})}

						{entries.length === 0 && (
							<tr>
								<td colSpan={5} className="px-4 py-12 text-center text-muted-fg">
									{search ? 'No matches' : 'Empty directory'}
								</td>
							</tr>
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
					onDownload={() => dlStartFile(s3FileUrl(entries[previewIdx].fullKey), entries[previewIdx].name)}
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
							toast.error(e instanceof Error ? e.message : 'Delete failed');
						}
					}}
				/>
			)}

			{/* Floating selection bar */}
			{selected.size > 0 && (
				<div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-surface rounded-full border border-border shadow-2xl px-5 py-2.5">
					<span className="text-xs font-medium text-foreground whitespace-nowrap">
						{selected.size} selected
						<span className="text-muted-fg ml-1">({formatSize(selectedSize)})</span>
					</span>
					<div className="h-4 w-px bg-border" />
					<button
						type="button"
						onClick={handleDownloadSelected}
						className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-bold text-white hover:opacity-90 transition-colors cursor-pointer"
					>
						Download
					</button>
					<button
						type="button"
						onClick={() => openCopyMove('copy')}
						className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
					>
						Copy
					</button>
					<button
						type="button"
						onClick={() => openCopyMove('move')}
						className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted transition-colors cursor-pointer"
					>
						Move
					</button>
					<button
						type="button"
						onClick={handleDelete}
						disabled={deleting}
						className="rounded-full bg-danger/10 px-3.5 py-1.5 text-xs font-bold text-danger hover:bg-danger/20 transition-colors cursor-pointer disabled:opacity-50"
					>
						{deleting ? '...' : 'Delete'}
					</button>
					<div className="h-4 w-px bg-border" />
					<button
						type="button"
						onClick={clear}
						className="text-xs text-muted-fg hover:text-foreground cursor-pointer"
						title="Esc to clear"
					>
						{'✕'}
					</button>
				</div>
			)}

			{ctxMenu && (
				<ContextMenu
					x={ctxMenu.x}
					y={ctxMenu.y}
					items={buildContextMenu(ctxMenu.entryIdx)}
					onClose={() => setCtxMenu(null)}
				/>
			)}

			{copyMoveMode && (
				<DirPicker
					data={data}
					title={copyMoveMode === 'move' ? 'Move to' : 'Copy to'}
					onSelect={executeCopyMove}
					onClose={() => setCopyMoveMode(null)}
				/>
			)}
		</div>
	);
};

export default S3Browser;
