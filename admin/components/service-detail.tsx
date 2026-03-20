'use client';

import { useState } from 'react';
import { contrastText } from '@/lib/color';
import type { ServiceT } from '@/lib/types';

const ServiceDetail = ({ service, onClose }: { service: ServiceT; onClose: () => void }) => {
	const [imgFailed, setImgFailed] = useState(false);
	const primary = service.colors.primary;

	return (
		<div className="rounded-lg border border-border overflow-hidden">
			<div className="relative h-28 flex items-end p-5" style={{ backgroundColor: primary }}>
				<button
					type="button"
					onClick={onClose}
					className="absolute top-3 right-3 rounded-md px-2 py-0.5 text-sm font-medium"
					style={{ color: contrastText(primary), backgroundColor: `${contrastText(primary)}15` }}
				>
					{'✕'}
				</button>
				<div className="flex items-center gap-4">
					<div
						className="size-14 rounded-xl flex items-center justify-center overflow-hidden shrink-0 border-2 border-white/20 text-lg font-bold shadow-lg"
						style={{ backgroundColor: primary, color: contrastText(primary) }}
					>
						{imgFailed ? (
							service.name.charAt(0).toUpperCase()
						) : (
							<img
								src={service.logo_url}
								alt={service.name}
								className="size-14 object-cover"
								onError={() => setImgFailed(true)}
							/>
						)}
					</div>
					<div>
						<h2 className="text-xl font-semibold" style={{ color: contrastText(primary) }}>
							{service.name}
						</h2>
						<span
							className="text-sm font-mono opacity-70"
							style={{ color: contrastText(primary) }}
						>
							{service.slug}
						</span>
					</div>
				</div>
			</div>

			<div className="p-5 space-y-4">
				<Row label="ID">
					<span className="font-mono text-sm text-muted-fg">{service.id}</span>
				</Row>

				<Row label="Domains">
					<div className="flex flex-wrap gap-1.5">
						{service.domains.map((d) => (
							<a
								key={d}
								href={`https://${d}`}
								target="_blank"
								rel="noopener noreferrer"
								className="rounded bg-muted px-2.5 py-1 text-sm font-mono text-muted-fg hover:text-accent transition-colors"
							>
								{d}
							</a>
						))}
					</div>
				</Row>

				<Row label="Category">
					{service.category ? (
						<span className="rounded-full bg-accent/10 px-3 py-1 text-sm text-accent">
							{service.category.title}
						</span>
					) : (
						<span className="text-sm text-muted-fg">Uncategorized</span>
					)}
				</Row>

				<Row label="Verified">
					{service.verified ? (
						<span className="text-emerald-400 font-medium">{'Yes ✓'}</span>
					) : (
						<span className="text-muted-fg">{'No'}</span>
					)}
				</Row>

				<Row label="Primary Color">
					<div className="flex items-center gap-2">
						<span
							className="inline-block rounded-md px-3 py-1 text-sm font-mono font-medium"
							style={{ backgroundColor: primary, color: contrastText(primary) }}
						>
							{primary}
						</span>
					</div>
				</Row>

				{service.ref_link && (
					<Row label="Referral Link">
						<a
							href={service.ref_link}
							target="_blank"
							rel="noopener noreferrer"
							className="text-sm text-accent hover:underline break-all"
						>
							{service.ref_link}
						</a>
					</Row>
				)}
			</div>
		</div>
	);
};

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
	<div className="flex items-start gap-4">
		<span className="w-28 shrink-0 text-sm text-muted-fg">{label}</span>
		<div>{children}</div>
	</div>
);

export default ServiceDetail;
