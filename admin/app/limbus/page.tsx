import TopBar from '@/components/top-bar';
import StatCard from '@/components/stat-card';
import LimbusTable from '@/components/limbus-table';
import { fetchLimbus } from '@/lib/api';

const LimbusPage = async () => {
	const entries = await fetchLimbus();
	const sources = new Map<string, number>();
	for (const e of entries) {
		sources.set(e.source, (sources.get(e.source) ?? 0) + 1);
	}

	return (
		<>
			<TopBar
				title="Limbus"
				subtitle="Services discovered externally, pending curation"
			/>
			<div className="p-8 space-y-8">
				<div className="grid grid-cols-4 gap-5">
					<StatCard label="Pending Review" value={entries.length} />
					{[...sources.entries()].map(([source, count]) => (
						<StatCard key={source} label={source} value={count} />
					))}
					<StatCard
						label="Queue Status"
						value={entries.length === 0 ? 'Empty' : 'Active'}
						detail={entries.length === 0 ? 'No pending services' : `${entries.length} awaiting review`}
						accent={entries.length > 0}
					/>
				</div>

				<LimbusTable data={entries} />
			</div>
		</>
	);
};

export default LimbusPage;
