import { roadCardDemo } from './road-card-demo';
import { completeCardDemo } from './complete-card-demo';
import { kebaliCardDemo } from './kebali-card-demo';
/** UI-only fixtures; never imported by catalogue/public payment APIs. */
export function getShowcaseWork(id: string | null | undefined) {
  return [completeCardDemo, kebaliCardDemo, roadCardDemo].find((work) => work.id === id) ?? null;
}
