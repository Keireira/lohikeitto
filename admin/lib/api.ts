import type { S3InfoT, S3ObjectT, ServiceT } from './types';

const API_URL = process.env.ADMIN_API_URL ?? process.env.NEXT_PUBLIC_ADMIN_API_URL ?? 'http://localhost:1337';

const fetchServices = async (): Promise<ServiceT[]> => {
	const res = await fetch(`${API_URL}/services`, { cache: 'no-store' });

	if (!res.ok) {
		throw new Error(`Failed to fetch services: ${res.status}`);
	}

	return res.json();
};

const fetchS3Objects = async (): Promise<S3ObjectT[]> => {
	const res = await fetch(`${API_URL}/s3`, { cache: 'no-store' });

	if (!res.ok) {
		throw new Error(`Failed to fetch S3 objects: ${res.status}`);
	}

	return res.json();
};

const fetchS3Info = async (): Promise<S3InfoT> => {
	const res = await fetch(`${API_URL}/s3/info`, { cache: 'no-store' });

	if (!res.ok) {
		throw new Error(`Failed to fetch S3 info: ${res.status}`);
	}

	return res.json();
};

const s3ArchiveUrl = (prefix?: string): string => {
	const base = `${API_URL}/s3/archive`;
	return prefix ? `${base}?prefix=${encodeURIComponent(prefix)}` : base;
};

const s3FileUrl = (key: string): string => `${API_URL}/s3/file/${encodeURIComponent(key)}`;

export { fetchServices, fetchS3Info, fetchS3Objects, s3ArchiveUrl, s3FileUrl };
