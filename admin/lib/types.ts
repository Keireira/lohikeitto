type CategoryT = {
	slug: string;
	title: string;
};

type ServiceT = {
	id: string;
	name: string;
	slug: string;
	bundle_id: string | null;
	description: string | null;
	domains: string[];
	alternative_names: string[];
	tags: string[];
	verified: boolean;
	category: CategoryT | null;
	colors: { primary: string };
	social_links: Record<string, string>;
	logo_url: string;
	ref_link: string | null;
};

type S3ObjectT = {
	key: string;
	size: number;
	last_modified: string | null;
};

type S3InfoT = {
	bucket: string;
	endpoint: string;
	base_url: string;
};

export type { CategoryT, S3InfoT, S3ObjectT, ServiceT };
