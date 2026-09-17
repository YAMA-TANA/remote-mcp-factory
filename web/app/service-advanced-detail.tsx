'use client';

import { useState } from 'react';
import type { GenericServiceSlug } from './service-data';
import LegacyServiceAdvancedDetail from './service-advanced-detail-legacy';
import McpManagementDetail from './service-mcp-management';
import { CronManagementDetail, RssManagementDetail, type ManagementProps } from './service-management-detail';
import { MailManagementDetail, QrManagementDetail } from './service-link-management';
import { MailOperations } from './service-mail-operations';
import { FunctionsManagementDetail, MonitorManagementDetail } from './service-runtime-management';
import { FunctionOperations } from './service-function-operations';
import { MonitorOperations } from './service-monitor-operations';
import ServiceHistoryExport from './service-history-export';

type Props = ManagementProps & { service: GenericServiceSlug };

function MailWorkspace(props: Props) {
  return <div className="advancedManagementStack">
    <MailManagementDetail {...props} />
    <MailOperations {...props} key={String(props.resource.id)} />
    <ServiceHistoryExport service="mail" resource={props.resource} api={props.api} />
  </div>;
}

function FunctionWorkspace(props: Props) {
  const [revision, setRevision] = useState(0);
  return <div className="advancedManagementStack">
    <FunctionsManagementDetail {...props} key={`${String(props.resource.id)}:${revision}`} />
    <FunctionOperations {...props} onRollback={() => setRevision(previous => previous + 1)} />
    <ServiceHistoryExport service="functions" resource={props.resource} api={props.api} />
  </div>;
}

function MonitorWorkspace(props: Props) {
  const [revision, setRevision] = useState(0);
  return <div className="advancedManagementStack">
    <MonitorManagementDetail {...props} key={`${String(props.resource.id)}:${revision}`} />
    <MonitorOperations {...props} onOptionsChanged={() => setRevision(previous => previous + 1)} />
    <ServiceHistoryExport service="monitor" resource={props.resource} api={props.api} />
  </div>;
}

/** The deployment listing omits endpoint, but the same Worker exposes /mcp/:id. */
function withMcpEndpoint(resource: Props['resource']): Props['resource'] {
  if (typeof resource.endpoint === 'string' && resource.endpoint) return resource;
  const id = resource.id;
  const configured = process.env.NEXT_PUBLIC_FACTORY_API_URL;
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{5,40}$/.test(id) || !configured) return resource;
  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.hostname === 'localhost')) return resource;
    return { ...resource, endpoint: `${url.origin}/mcp/${encodeURIComponent(id)}` };
  } catch { return resource; }
}

/** Preserve existing management actions while exposing the advanced APIs for each product. */
export default function ServiceAdvancedDetail(props: Props) {
  if (props.service === 'mcp') return <McpManagementDetail {...props} resource={withMcpEndpoint(props.resource)} />;
  if (props.service === 'rss') return <RssManagementDetail {...props} />;
  if (props.service === 'cron') return <div className="advancedManagementStack"><CronManagementDetail {...props} /><ServiceHistoryExport service="cron" resource={props.resource} api={props.api} /></div>;
  if (props.service === 'qr') return <QrManagementDetail {...props} />;
  if (props.service === 'mail') return <MailWorkspace {...props} />;
  if (props.service === 'functions') return <FunctionWorkspace {...props} />;
  if (props.service === 'monitor') return <MonitorWorkspace {...props} />;
  return <LegacyServiceAdvancedDetail {...props} />;
}
