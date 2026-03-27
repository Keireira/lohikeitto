const Section = ({
	title,
	action,
	children
}: {
	title: string;
	action?: React.ReactNode;
	children: React.ReactNode;
}) => (
	<div>
		<div className="flex items-center justify-between mb-3">
			<span className="text-[10px] font-bold uppercase tracking-widest text-accent">{title}</span>
			{action}
		</div>
		<div className="space-y-3">{children}</div>
	</div>
);

export default Section;
