'use client';

import { useEffect, useState } from 'react';
import { getCachedImageUrl } from './thumb-cache';

const Thumbnail = ({ fileKey }: { fileKey: string }) => {
	const [url, setUrl] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;

		getCachedImageUrl(fileKey)
			.then((u) => {
				if (!cancelled) setUrl(u);
			})
			.catch(() => {});

		return () => {
			cancelled = true;
		};
	}, [fileKey]);

	if (!url) return <div className="size-10 rounded-lg bg-muted shrink-0" />;

	return <img src={url} alt="" className="size-10 rounded-lg object-cover bg-muted shrink-0" />;
};

export default Thumbnail;
