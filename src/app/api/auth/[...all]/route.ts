import { auth } from '@/lib/auth'; // path to your auth file
import { toNextJsHandler } from 'better-auth/next-js';

/**
 * Strip trailing slash from request URL before passing to Better Auth.
 * Next.js trailingSlash:true rewrites /api/auth/get-session to /api/auth/get-session/
 * but Better Auth's internal router doesn't match paths with trailing slashes.
 */
function withoutTrailingSlash(
  handler: (req: Request) => Promise<Response>
): (req: Request) => Promise<Response> {
  return (req: Request) => {
    const url = new URL(req.url);
    if (url.pathname.endsWith('/') && url.pathname !== '/') {
      url.pathname = url.pathname.slice(0, -1);
      return handler(new Request(url, req));
    }
    return handler(req);
  };
}

const handlers = toNextJsHandler(auth);

export const POST = withoutTrailingSlash(handlers.POST);
export const GET = withoutTrailingSlash(handlers.GET);
