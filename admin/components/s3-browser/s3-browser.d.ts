export type Entry = { name: string; isDir: boolean; size: number; fullKey: string; lastModified: string | null };
export type SortKey = 'name' | 'size' | 'lastModified';
export type SortDir = 'asc' | 'desc';
export type PreviewData = { src: string; name: string; size: number; lastModified: string | null };

export const IMAGE_EXTS: Set<string>;
export const isImage: (name: string) => boolean;
