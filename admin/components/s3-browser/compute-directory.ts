import type { S3ObjectT } from '@/lib/types';
import type { Entry, SortDir, SortKey } from './s3-browser.d';

export const computeDirectory = (
	objects: S3ObjectT[],
	currentPath: string,
	search: string,
	sortKey: SortKey,
	sortDir: SortDir
) => {
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

	const dirEntries: Entry[] = [...dirs.entries()].map(([name, size]) => ({
		name,
		isDir: true,
		size,
		fullKey: `${currentPath}${name}/`,
		lastModified: null
	}));

	let all = [...dirEntries, ...files];

	// Search filter -- also search recursively in subdirectories
	if (search) {
		const q = search.toLowerCase();
		// Add matching files from all subdirectories
		const deepMatches: Entry[] = [];
		for (const obj of objects) {
			if (obj.key.endsWith('/') || obj.size === 0) continue;
			if (!obj.key.startsWith(currentPath)) continue;
			const relative = obj.key.slice(currentPath.length);
			if (!relative.includes('/')) continue; // already in `files`
			const filename = relative.split('/').pop() ?? '';
			if (filename.toLowerCase().includes(q)) {
				deepMatches.push({
					name: relative,
					isDir: false,
					size: obj.size,
					fullKey: obj.key,
					lastModified: obj.last_modified
				});
			}
		}
		all = [...all.filter((e) => e.name.toLowerCase().includes(q)), ...deepMatches];
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
};
