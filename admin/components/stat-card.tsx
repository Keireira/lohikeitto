type StatCardProps = {
	label: string;
	value: string | number;
	detail?: string;
	accent?: boolean;
	indicator?: 'green' | 'yellow' | 'red';
};

const StatCard = ({ label, value, detail, accent, indicator }: StatCardProps) => (
	<div className={`rounded-2xl p-6 ${accent ? 'bg-accent text-white' : 'bg-surface border border-border'}`}>
		<div className="flex items-center justify-between mb-3">
			<span className={`text-[10px] font-bold uppercase tracking-wider ${accent ? 'text-white/70' : 'text-muted-fg'}`}>
				{label}
			</span>
			{indicator && (
				<span
					className={`size-2 rounded-full ${
						indicator === 'green' ? 'bg-success' : indicator === 'yellow' ? 'bg-yellow-400' : 'bg-danger'
					}`}
				/>
			)}
		</div>
		<p className={`text-2xl font-extrabold tracking-tight ${accent ? 'text-white' : 'text-foreground'}`}>{value}</p>
		{detail && <p className={`text-sm mt-1 ${accent ? 'text-white/70' : 'text-muted-fg'}`}>{detail}</p>}
	</div>
);

export default StatCard;
