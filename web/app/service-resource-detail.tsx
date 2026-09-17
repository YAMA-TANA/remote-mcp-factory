'use client';

import type { GenericServiceSlug } from './service-data';
import FormsManagementDetail from './service-forms-management';
import LicenseManagementDetail from './service-license-management';
import LegacyServiceResourceDetail from './service-resource-detail-legacy';

type Props = {
  service: GenericServiceSlug;
  resource: Record<string, unknown>;
  api: (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>;
  onClose: () => void;
  onChanged: () => void;
  copyValue: (value: string) => Promise<void>;
};

/** Route specialized management without changing JSON, Files or Flags workflows. */
export default function ServiceResourceDetail(props: Props) {
  if (props.service === 'forms') return <FormsManagementDetail {...props} />;
  if (props.service === 'license') return <LicenseManagementDetail {...props} />;
  return <LegacyServiceResourceDetail {...props} />;
}
