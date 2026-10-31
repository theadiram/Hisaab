import { readCatalogue } from '@/lib/catalogue';
export async function GET() {
  const c = await readCatalogue();
  return Response.json({
    cutoff: c.cutoff,
    works: c.totalWorks,
    districtsCovered: c.districtsCovered,
    districtsExpected: c.districtsExpected,
    sources: c.sources,
    releaseReady: false,
  });
}
