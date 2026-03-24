'use client';

import { useEffect, useState } from 'react';
import Squircle from '@/components/squircle';
import { contrastText } from '@/lib/color';
import { useLogoCacheStore } from '@/lib/logo-cache';

const API = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? 'http://localhost:1337';

const slugFromUrl = (src: string): string => {
	try {
		const filename = new URL(src).pathname.split('/').pop() ?? '';
		return filename.replace(/\.[^.]+$/, '');
	} catch {
		return '';
	}
};

const logoApiUrl = (slug: string): string => `${API}/s3/file/logos/${slug}.webp`;

const ServiceIcon = ({ src, name, color, size = 40 }: { src: string; name: string; color: string; size?: number }) => {
	const slug = slugFromUrl(src);
	const cached = useLogoCacheStore((s) => s.blobs.get(slug));
	const setCache = useLogoCacheStore((s) => s.set);
	const [blob, setBlob] = useState<string | undefined>(cached);

	useEffect(() => {
		// If cache has it, use it
		if (cached) { setBlob(cached); return; }
		if (!slug) return;

		let cancelled = false;
		fetch(logoApiUrl(slug))
			.then((r) => (r.ok ? r.blob() : Promise.reject()))
			.then((b) => {
				if (cancelled) return;
				const url = URL.createObjectURL(b);
				setBlob(url);
				setCache(slug, url);
			})
			.catch(() => {});
		return () => { cancelled = true; };
	}, [slug, cached]);

	return (
		<Squircle
			size={size}
			color={color}
			src={blob}
			fallback={!blob ? name.charAt(0).toUpperCase() : undefined}
			style={{ color: contrastText(color) }}
		/>
	);
};

export default ServiceIcon;
export { logoApiUrl, slugFromUrl };
