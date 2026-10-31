import { redirect } from 'next/navigation';
// Preserve existing bookmarks on the three public map screens.
export default function Spending() {
  redirect('/?explore=1');
}
