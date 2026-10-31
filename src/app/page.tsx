import { readCatalogue } from '@/lib/catalogue';
import { PublicAtlas } from '@/components/public-atlas';
import assetAcquisition from '../../data/geosadak-acquisition.json';
import projectDataCount from '../../data/project-data-count.json';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const catalogue = await readCatalogue();
  return (
    <PublicAtlas
      catalogue={catalogue}
      assetRecordTotal={assetAcquisition.assetRows}
      projectDataSourceRecords={projectDataCount.projectDataSourceRecords}
    />
  );
}
