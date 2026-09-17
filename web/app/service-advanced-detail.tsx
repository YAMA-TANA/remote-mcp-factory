'use client';

import type { GenericServiceSlug } from './service-data';
import LegacyServiceAdvancedDetail from './service-advanced-detail-legacy';
import { CronManagementDetail, RssManagementDetail, type ManagementProps } from './service-management-detail';

type Props = ManagementProps & { service: GenericServiceSlug };

/** Keep the established editor for other services while migrating real workflows individually. */
export default function ServiceAdvancedDetail(props: Props) {
  if (props.service === 'rss') return <RssManagementDetail {...props} />;
  if (props.service === 'cron') return <CronManagementDetail {...props} />;
  return <LegacyServiceAdvancedDetail {...props} />;
}
