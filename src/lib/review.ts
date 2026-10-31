import 'server-only';
// Every publication, including local development, must use explicit MFA evidence review.
export async function approveCandidate(_id: string, _reason: string): Promise<never> {
  throw new Error(
    'Automatic local approval is disabled. Use the MFA owner evidence review workflow.',
  );
}
