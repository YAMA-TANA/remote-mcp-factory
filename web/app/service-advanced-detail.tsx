'use client';

import LegacyServiceAdvancedDetail from './service-advanced-detail-legacy';
import { MailManagementDetail, QrManagementDetail } from './service-link-management';

type Props = Parameters<typeof LegacyServiceAdvancedDetail>[0];

/** Route products to their own working management UI without altering other service APIs. */
export default function ServiceAdvancedDetail(props: Props) {
  if (props.service === 'qr') return <QrManagementDetail {...props} />;
  if (props.service === 'mail') return <MailManagementDetail {...props} />;
  return <LegacyServiceAdvancedDetail {...props} />;
}
