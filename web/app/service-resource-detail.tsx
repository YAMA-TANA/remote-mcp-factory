'use client';

import type { GenericServiceSlug } from './service-data';
import FilesManagementDetail from './service-files-management';
import FlagsManagementDetail from './service-flags-management';
import FormsManagementDetail from './service-forms-management';
import JsonManagementDetail from './service-json-management';
import LicenseManagementDetail from './service-license-management';
import LegacyServiceResourceDetail from './service-resource-detail-legacy';
import ServiceResourceExport from './service-resource-export-panel';

type Props = {
  service: GenericServiceSlug;
  resource: Record<string, unknown>;
  api: (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>;
  onClose: () => void;
  onChanged: () => void;
  copyValue: (value: string) => Promise<void>;
};

function LicenseWorkspace(props: Props) {
  return <div className="advancedManagementStack"><LicenseManagementDetail {...props} /><ServiceResourceExport service="license" resource={props.resource} api={props.api} /></div>;
}
function FlagsWorkspace(props: Props) {
  return <div className="advancedManagementStack"><FlagsManagementDetail {...props} /><ServiceResourceExport service="flags" resource={props.resource} api={props.api} /></div>;
}

/** Route specialized management without changing other service workflows. */
export default function ServiceResourceDetail(props: Props) {
  if (props.service === 'files') return <FilesManagementDetail {...props} />;
  if (props.service === 'json') return <JsonManagementDetail {...props} />;
  if (props.service === 'forms') return <FormsManagementDetail {...props} />;
  if (props.service === 'license') return <LicenseWorkspace {...props} />;
  if (props.service === 'flags') return <FlagsWorkspace {...props} />;
  return <LegacyServiceResourceDetail {...props} />;
}
