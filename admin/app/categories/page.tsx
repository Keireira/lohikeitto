import CategoriesManager from '@/components/categories-manager';
import TopBar from '@/components/top-bar';
import { fetchCategories, fetchServices } from '@/lib/api';

const CategoriesPage = async () => {
	const [categories, services] = await Promise.all([fetchCategories(), fetchServices()]);

	return (
		<>
			<TopBar title="Categories" subtitle={`${categories.length} categories`} />
			<div className="p-8">
				<CategoriesManager categories={categories} services={services} />
			</div>
		</>
	);
};

export default CategoriesPage;
