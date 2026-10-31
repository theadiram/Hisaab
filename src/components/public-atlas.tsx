'use client';

import dynamic from 'next/dynamic';
import type { Catalogue } from '@/lib/model';
import { PublicPreviewGate } from './public-preview-gate';

const Atlas = dynamic(() => import('./atlas-app').then((module) => module.AtlasApp), {
  ssr: false,
  loading: () => <p role="status">Loading Hisaab…</p>,
});

export function PublicAtlas({
  catalogue,
  assetRecordTotal,
  projectDataSourceRecords,
}: {
  catalogue: Catalogue;
  assetRecordTotal: number;
  projectDataSourceRecords: number;
}) {
  return (
    <PublicPreviewGate
      assetRecordTotal={assetRecordTotal}
      projectDataSourceRecords={projectDataSourceRecords}
    >
      <Atlas catalogue={catalogue} />
    </PublicPreviewGate>
  );
}
