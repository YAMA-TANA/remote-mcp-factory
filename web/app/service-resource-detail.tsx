'use client';

import type { GenericServiceSlug } from './service-data';
import FlagsManagementDetail from './service-flags-management';
import FormsManagementDetail from './service-forms-management';
import JsonManagementDetail from './service-json-management';
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

/** Route specialized management while preserving the existing Files workflow. */
export default function ServiceResourceDetail(props: Props) {
  if (props.service === 'json') return <JsonManagementDetail {...props} />;
  if (props.service === 'forms') return <FormsManagementDetail {...props} />;
  if (props.service === 'license') return <LicenseManagementDetail {...props} />;
  if (props.service === 'flags') return <FlagsManagementDetail {...props} />;
  return <LegacyServiceResourceDetail {...props} />;
}
