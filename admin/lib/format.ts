const formatSize = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const formatEta = (seconds: number): string => {
	if (!Number.isFinite(seconds) || seconds < 0) return '';
	if (seconds < 1) return '< 1s';
	if (seconds < 60) return `~${Math.ceil(seconds)}s`;
	return `~${Math.floor(seconds / 60)}m ${Math.ceil(seconds % 60)}s`;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

const formatDate = (iso: string | null): string => {
	if (!iso) return '';
	const d = new Date(iso);
	const day = String(d.getDate()).padStart(2, '0');
	const mon = MONTHS[d.getMonth()];
	const year = d.getFullYear();
	const time = d.toTimeString().slice(0, 8);
	return `${day} ${mon} ${year} ${time}`;
};

const triggerSave = (blob: Blob, filename: string) => {
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = filename;
	a.click();
	URL.revokeObjectURL(a.href);
};

export { formatDate, formatEta, formatSize, MONTHS, triggerSave };
