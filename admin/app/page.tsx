import TopBar from '@/components/top-bar';
import StatCard from '@/components/stat-card';
import ServicesTable from '@/components/services-table';
import { fetchCategories, fetchServices, fetchS3Objects } from '@/lib/api';

const Home = async () => {
	const [services, categories, s3Objects] = await Promise.all([fetchServices(), fetchCategories(), fetchS3Objects()]);
	const verified = services.filter((s) => s.verified).length;
	const catCount = new Set(services.map((s) => s.category?.title).filter(Boolean)).size;

	return (
		<>
			<TopBar
				title="Service Catalogue"
				subtitle={`${services.length} services registered`}
				actions={
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-4 text-xs text-muted-fg">
							<span><strong className="text-foreground">{services.length}</strong> services</span>
							<span><strong className="text-foreground">{verified}</strong> verified</span>
							<span><strong className="text-foreground">{catCount}</strong> categories</span>
						</div>
						<div className="flex items-center gap-2 rounded-full bg-success/10 px-3 py-1.5">
							<span className="size-2 rounded-full bg-success animate-pulse" />
							<span className="text-xs font-medium text-success">Synced</span>
						</div>
					</div>
				}
			/>
			<div className="p-8">
				<ServicesTable data={services} categories={categories} s3Logos={s3Objects.filter((o) => o.key.startsWith('logos/') && !o.key.endsWith('/') && o.size > 0).map((o) => o.key.replace('logos/', '').replace(/\.[^.]+$/, ''))} />
			</div>
		</>
	);
};

export default Home;
