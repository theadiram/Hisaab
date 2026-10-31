import { requireAdmin } from '@/lib/admin';
import { ComplaintReview } from '@/components/complaint-review';
export default async function Page() {
  try {
    await requireAdmin();
  } catch {
    return (
      <main className="review-page">
        <h1>Owner authenticator required</h1>
        <a href="/admin">Sign in and verify your authenticator</a>
      </main>
    );
  }
  return <ComplaintReview />;
}
