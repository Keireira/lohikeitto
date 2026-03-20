'use client';

import { useEffect, useState } from 'react';

const ThemeToggle = () => {
	const [dark, setDark] = useState(false);

	useEffect(() => {
		const stored = localStorage.getItem('theme');
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		const isDark = stored ? stored === 'dark' : prefersDark;
		setDark(isDark);
		document.documentElement.classList.toggle('dark', isDark);
	}, []);

	const toggle = () => {
		const next = !dark;
		setDark(next);
		document.documentElement.classList.toggle('dark', next);
		localStorage.setItem('theme', next ? 'dark' : 'light');
	};

	return (
		<button
			type="button"
			onClick={toggle}
			className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-fg hover:text-foreground hover:bg-muted transition-colors"
		>
			{dark ? 'Light' : 'Dark'}
		</button>
	);
};

export default ThemeToggle;
