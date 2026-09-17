'use client';

import type { GenericServiceSlug } from './service-data';
import FilesManagementDetail from './service-files-management';
import FlagsManagementDetail from './service-flags-management';
import FormsManagementDetail from './service-forms-management';
import JsonManagementDetail from './service-json-management';
import LicenseManagementDetail from './service-license-management';
import LegacyServiceResourceDetail from './service-resource-detail-legacy';
import ServiceResourceExport from './service-resource-export-panel';
import { FilesInventoryTools, JsonBackupTools } from './service-inventory-tools';
import { FlagsGovernanceTools, FormsGovernanceTools, LicenseGovernanceTools } from './service-governance-tools';

type Props = {
  service: GenericServiceSlug;
  resource: Record<string, unknown>;
  api: (path: string, init?: RequestInit) => Promise<{ payload: unknown; blob?: Blob }>;
  onClose: () => void;
  onChanged: () => void;
  copyValue: (value: string) => Promise<void>;
};

function FilesWorkspace(props: Props) {
  return <div className="advancedManagementStack" key={String(props.resource.id)}><FilesManagementDetail {...props} /><FilesInventoryTools resource={props.resource} api={props.api} /></div>;
}
function JsonWorkspace(props: Props) {
  return <div className="advancedManagementStack" key={String(props.resource.id)}><JsonManagementDetail {...props} /><JsonBackupTools resource={props.resource} api={props.api} /></div>;
}
function FormsWorkspace(props: Props) {
  return <div className="advancedManagementStack" key={String(props.resource.id)}><FormsManagementDetail {...props} /><FormsGovernanceTools resource={props.resource} api={props.api} /></div>;
}
function LicenseWorkspace(props: Props) {
  return <div className="advancedManagementStack" key={String(props.resource.id)}><LicenseManagementDetail {...props} /><LicenseGovernanceTools resource={props.resource} api={props.api} /><ServiceResourceExport service="license" resource={props.resource} api={props.api} /></div>;
}
function FlagsWorkspace(props: Props) {
  return <div className="advancedManagementStack" key={String(props.resource.id)}><FlagsManagementDetail {...props} /><FlagsGovernanceTools resource={props.resource} api={props.api} /><ServiceResourceExport service="flags" resource={props.resource} api={props.api} /></div>;
}

/** Route specialized management without changing other service workflows. */
export default function ServiceResourceDetail(props: Props) {
  if (props.service === 'files') return <FilesWorkspace {...props} />;
  if (props.service === 'json') return <JsonWorkspace {...props} />;
  if (props.service === 'forms') return <FormsWorkspace {...props} />;
  if (props.service === 'license') return <LicenseWorkspace {...props} />;
  if (props.service === 'flags') return <FlagsWorkspace {...props} />;
  return <LegacyServiceResourceDetail {...props} />;
}
