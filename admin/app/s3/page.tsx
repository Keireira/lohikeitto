import EnvSync from '@/components/env-sync';
import S3Browser from '@/components/s3-browser';
import TopBar from '@/components/top-bar';
import { fetchS3Info, fetchS3Objects, fetchServices } from '@/lib/api';
import { formatSize } from '@/lib/format';

const S3Page = async () => {
	const [objects, info, services] = await Promise.all([fetchS3Objects(), fetchS3Info(), fetchServices()]);
	const files = objects.filter((o) => !o.key.endsWith('/') && o.size > 0);
	const totalBytes = files.reduce((a, o) => a + o.size, 0);

	const s3Provider = (() => {
		try {
			const host = new URL(info.endpoint).hostname;
			if (host.includes('cloudflare') || host.includes('r2.')) return 'R2 Cloudflare';
			if (host.includes('amazonaws')) return 'AWS S3';
			if (host.includes('digitalocean')) return 'DO Spaces';
			if (host.includes('minio')) return 'MinIO';
			return host.split('.')[0];
		} catch {
			return 'S3';
		}
	})();

	return (
		<>
			<EnvSync s3Info={s3Provider} />

			<TopBar
				title="S3 Storage"
				subtitle={info.base_url}
				actions={
					<div className="flex items-center gap-4">
						<div className="flex items-center gap-4 text-xs text-muted-fg">
							<span>
								<strong className="text-foreground">{files.length}</strong> files
							</span>
							<span>
								<strong className="text-foreground">{formatSize(totalBytes)}</strong>
							</span>
						</div>
						<div className="flex items-center gap-2 rounded-full bg-success/10 px-3 py-1.5">
							<span className="size-2 rounded-full bg-success animate-pulse" />
							<span className="text-xs font-medium text-success">Online</span>
						</div>
						<div className="flex items-center gap-2 rounded-full bg-muted px-3 py-1.5">
							<span className="text-xs text-muted-fg font-mono">{info.bucket}</span>
						</div>
					</div>
				}
			/>

			<div className="p-8">
				<S3Browser data={objects} services={services} />
			</div>
		</>
	);
};

export default S3Page;
