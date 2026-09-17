'use client';

import type { GenericServiceSlug } from './service-data';
import LegacyServiceAdvancedDetail from './service-advanced-detail-legacy';
import { CronManagementDetail, RssManagementDetail, type ManagementProps } from './service-management-detail';
import { MailManagementDetail, QrManagementDetail } from './service-link-management';
import { FunctionsManagementDetail, MonitorManagementDetail } from './service-runtime-management';

type Props = ManagementProps & { service: GenericServiceSlug };

/** Preserve existing management actions while migrating each service individually. */
export default function ServiceAdvancedDetail(props: Props) {
  if (props.service === 'rss') return <RssManagementDetail {...props} />;
  if (props.service === 'cron') return <CronManagementDetail {...props} />;
  if (props.service === 'qr') return <QrManagementDetail {...props} />;
  if (props.service === 'mail') return <MailManagementDetail {...props} />;
  if (props.service === 'functions') return <FunctionsManagementDetail {...props} />;
  if (props.service === 'monitor') return <MonitorManagementDetail {...props} />;
  return <LegacyServiceAdvancedDetail {...props} />;
}
