'use client';

import { useState } from 'react';
import type { GenericServiceSlug } from './service-data';
import LegacyServiceAdvancedDetail from './service-advanced-detail-legacy';
import { CronManagementDetail, RssManagementDetail, type ManagementProps } from './service-management-detail';
import { MailManagementDetail, QrManagementDetail } from './service-link-management';
import { FunctionsManagementDetail, MonitorManagementDetail } from './service-runtime-management';
import { FunctionOperations } from './service-function-operations';
import { MonitorOperations } from './service-monitor-operations';

type Props = ManagementProps & { service: GenericServiceSlug };

function FunctionWorkspace(props: Props) {
  const [revision, setRevision] = useState(0);
  return <div className="advancedManagementStack">
    <FunctionsManagementDetail {...props} key={`${String(props.resource.id)}:${revision}`} />
    <FunctionOperations {...props} onRollback={() => setRevision(previous => previous + 1)} />
  </div>;
}

function MonitorWorkspace(props: Props) {
  const [revision, setRevision] = useState(0);
  return <div className="advancedManagementStack">
    <MonitorManagementDetail {...props} key={`${String(props.resource.id)}:${revision}`} />
    <MonitorOperations {...props} onOptionsChanged={() => setRevision(previous => previous + 1)} />
  </div>;
}

/** Preserve existing management actions while exposing the advanced APIs for each product. */
export default function ServiceAdvancedDetail(props: Props) {
  if (props.service === 'rss') return <RssManagementDetail {...props} />;
  if (props.service === 'cron') return <CronManagementDetail {...props} />;
  if (props.service === 'qr') return <QrManagementDetail {...props} />;
  if (props.service === 'mail') return <MailManagementDetail {...props} />;
  if (props.service === 'functions') return <FunctionWorkspace {...props} />;
  if (props.service === 'monitor') return <MonitorWorkspace {...props} />;
  return <LegacyServiceAdvancedDetail {...props} />;
}
