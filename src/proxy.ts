import { NextResponse, type NextRequest } from 'next/server';
import { authorizedPreview } from '@/lib/security';
import { publicPreviewRead } from '@/lib/public-preview-access';
export function proxy(request: NextRequest) {
  if (
    process.env.HISAAB_MIGRATION_READ_ONLY === 'true' &&
    !['GET', 'HEAD'].includes(request.method)
  )
    return NextResponse.json(
      { error: 'Changes are temporarily paused during the database move. No changes were saved.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  if (process.env.HISAAB_PUBLIC_RELEASE === 'true') {
    // Explicitly fail closed until the signed release-gate integration is implemented.
    return new NextResponse(
      'Public release is not yet enabled. Complete the release audit first.',
      { status: 503 },
    );
  }
  if (process.env.HISAAB_PUBLIC_PREVIEW === 'true') {
    if (publicPreviewRead(request.nextUrl.pathname, request.method)) return NextResponse.next();
    if (
      !request.nextUrl.pathname.startsWith('/admin') &&
      !request.nextUrl.pathname.startsWith('/api/v1/admin') &&
      !authorizedPreview(request)
    )
      return NextResponse.json(
        {
          error:
            'This public preview supports exploring published records. Citizen submissions are not open yet.',
        },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
  }
  if (!authorizedPreview(request))
    return new NextResponse('Hisaab private preview. Administrator credentials required.', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Hisaab private preview"',
        'Cache-Control': 'no-store',
      },
    });
  return NextResponse.next();
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
