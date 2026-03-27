'use client';

import { useEffect } from 'react';

const EnvSync = ({ dbHost, s3Info }: { dbHost?: string; s3Info?: string }) => {
	useEffect(() => {
		if (dbHost) localStorage.setItem('admin_db_host', dbHost);
		if (s3Info) localStorage.setItem('admin_s3_info', s3Info);
	}, [dbHost, s3Info]);
	return null;
};

export default EnvSync;
