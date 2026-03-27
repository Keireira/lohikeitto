const Label = ({ text, children }: { text: string; children: React.ReactNode }) => (
	<div>
		<span className="text-xs text-muted-fg mb-1 block">{text}</span>
		{children}
	</div>
);

export default Label;
