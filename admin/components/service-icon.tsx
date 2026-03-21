'use client';

import { useEffect, useState } from 'react';
import Squircle from '@/components/squircle';
import { contrastText } from '@/lib/color';

const API = process.env.NEXT_PUBLIC_ADMIN_API_URL ?? 'http://localhost:1337';

const logoUrl = (src: string): string => {
	try {
		return `${API}/s3/file/logos/${new URL(src).pathname.split('/').pop()}`;
	} catch {
		return src;
	}
};

const ServiceIcon = ({ src, name, color, size = 40 }: { src: string; name: string; color: string; size?: number }) => {
	const [blob, setBlob] = useState<string | undefined>(undefined);
	const url = logoUrl(src);

	useEffect(() => {
		let cancelled = false;
		fetch(url)
			.then((r) => (r.ok ? r.blob() : Promise.reject()))
			.then((b) => { if (!cancelled) setBlob(URL.createObjectURL(b)); })
			.catch(() => {});
		return () => { cancelled = true; };
	}, [url]);

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
export { logoUrl };
