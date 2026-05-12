import { detectChinaUser } from '@/lib/geo';

export async function GET(req: Request) {
  const headers = Object.fromEntries(req.headers);
  const detection = detectChinaUser({
    headers: req.headers,
    prompt: new URL(req.url).searchParams.get('prompt'),
  });
  return Response.json(
    { detection, headers },
    { headers: { 'cache-control': 'no-store' } }
  );
}
