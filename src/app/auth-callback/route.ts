/**
 * OAuth popup callback route.
 *
 * After cross-origin OAuth redirects (Google -> Better Auth -> here),
 * COOP (Cross-Origin-Opener-Policy) severs the window.opener relationship,
 * making postMessage unusable. We use origin-based channels instead:
 *
 * 1. BroadcastChannel -- fast, cross-window, not affected by COOP
 * 2. localStorage signal -- triggers storage event in parent + poll fallback
 *
 * Both channels include a nonce for request verification.
 * The parent window listens for both in use-popup-oauth.ts.
 */
export function GET() {
  const html = `<!DOCTYPE html>
<html>
<head><title>Login complete</title></head>
<body>
<script>
  // Get nonce from localStorage (stored by parent before opening popup)
  var nonce = '';
  try {
    nonce = localStorage.getItem('auth_popup_nonce') || '';
  } catch(e) {}

  // Channel 1: BroadcastChannel (fast, not affected by COOP)
  try {
    var bc = new BroadcastChannel('auth_popup');
    bc.postMessage({ type: 'AUTH_SUCCESS', nonce: nonce });
    setTimeout(function() { bc.close(); }, 500);
  } catch(e) {}

  // Channel 2: localStorage signal (triggers storage event + poll fallback)
  try {
    localStorage.setItem('auth_popup_result', nonce);
  } catch(e) {}

  // Close popup after a short delay
  setTimeout(function() { window.close(); }, 300);

  // If window.close() is blocked (not opened via script), redirect after 2s
  setTimeout(function() { window.location.href = '/'; }, 2000);
</script>
<p>Completing login...</p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
