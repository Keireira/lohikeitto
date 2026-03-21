export const scrollToTop = () => {
	window.scrollTo({ top: 0, behavior: 'instant' });
};

export const getPageRange = (current: number, total: number): (number | '...')[] => {
	if (total <= 7) {
		return Array.from({ length: total }, (_, i) => i);
	}

	const pages: (number | '...')[] = [];
	pages.push(0);

	const start = Math.max(1, current - 1);
	const end = Math.min(total - 2, current + 1);

	if (start > 1) {
		pages.push('...');
	}

	for (let i = start; i <= end; i++) {
		pages.push(i);
	}

	if (end < total - 2) {
		pages.push('...');
	}

	pages.push(total - 1);

	return pages;
};
