import Nav from '@/components/nav';
import ServicesTable from '@/components/services-table';
import { fetchServices } from '@/lib/api';

const Home = async () => {
	const services = await fetchServices();

	return (
		<div className="mx-auto max-w-[1440px] px-6 py-8">
			<Nav serviceCount={services.length} />
			<ServicesTable data={services} />
		</div>
	);
};

export default Home;
