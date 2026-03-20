import Nav from '@/components/nav';
import S3Browser from '@/components/s3-browser';
import { fetchS3Info, fetchS3Objects } from '@/lib/api';

const S3Page = async () => {
	const [objects, info] = await Promise.all([fetchS3Objects(), fetchS3Info()]);

	return (
		<div className="mx-auto max-w-[1440px] px-6 py-8">
			<Nav bucketName={info.bucket} bucketEndpoint={info.endpoint} bucketBaseUrl={info.base_url} />
			<S3Browser data={objects} />
		</div>
	);
};

export default S3Page;
