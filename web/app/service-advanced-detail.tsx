'use client';

import type { GenericServiceSlug } from './service-data';
import LegacyServiceAdvancedDetail from './service-advanced-detail-legacy';
import { CronManagementDetail, RssManagementDetail, type ManagementProps } from './service-management-detail';
import { MailManagementDetail, QrManagementDetail } from './service-link-management';

type Props = ManagementProps & { service: GenericServiceSlug };

/** Keep working legacy operations while moving each product into its own management workflow. */
export default function ServiceAdvancedDetail(props: Props) {
  if (props.service === 'rss') return <RssManagementDetail {...props} />;
  if (props.service === 'cron') return <CronManagementDetail {...props} />;
  if (props.service === 'qr') return <QrManagementDetail {...props} />;
  if (props.service === 'mail') return <MailManagementDetail {...props} />;
  return <LegacyServiceAdvancedDetail {...props} />;
}
