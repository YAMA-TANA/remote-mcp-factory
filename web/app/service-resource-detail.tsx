'use client';

import type { GenericServiceSlug } from './service-data';
import FormsManagementDetail from './service-forms-management';
import LegacyServiceResourceDetail from './service-resource-detail-legacy';

type Props = {
  service: GenericServiceSlug;
  resource: Record<string, unknown>;
  api: (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>;
  onClose: () => void;
  onChanged: () => void;
  copyValue: (value: string) => Promise<void>;
};

/** Keep JSON, Files, License and Flags workflows unchanged while specializing Forms. */
export default function ServiceResourceDetail(props: Props) {
  if (props.service === 'forms') return <FormsManagementDetail {...props} />;
  return <LegacyServiceResourceDetail {...props} />;
}
