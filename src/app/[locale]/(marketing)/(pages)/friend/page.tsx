import Container from '@/components/layout/container';
import { constructMetadata } from '@/lib/metadata';
import type { Metadata } from 'next';
import type { Locale } from 'next-intl';

const friends: { name: string; url: string }[] = [
  { name: 'Cal.com — Gemini Omni', url: 'https://cal.com/gemini-omni' },
  { name: 'Stripe Climate', url: 'https://climate.stripe.com/3wBL7u' },
  {
    name: 'Google',
    url: 'http://www.google.de/url?q=https://gemini-omni.video/',
  },
  {
    name: 'My Crafts Showcase',
    url: 'https://my-crafts-showcase.lovable.app/',
  },
  { name: 'Bio.site — Gemini Omni', url: 'https://bio.site/gemini_omni' },
  { name: 'Lnk.bio — Gemini Omni', url: 'https://lnk.bio/gemini-omni' },
  { name: 'Solo.to — Gemini Omni', url: 'https://solo.to/gemini-omni' },
  { name: 'Linktree — Gemini Omni', url: 'https://linktr.ee/gemini_omni' },
  {
    name: 'Mastodon — @AlexCheng001',
    url: 'https://mastodon.social/@AlexCheng001',
  },
  {
    name: 'Kit — Gemini Omni Is Coming',
    url: 'https://jane-smith-689.kit.com/posts/gemini-omni-is-coming-the-next-step-in-ai-video-creation',
  },
];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return constructMetadata({
    title: 'Friends | Gemini Omni',
    description: 'Friends and partners of Gemini Omni.',
    locale,
    pathname: '/friend',
  });
}

export default function FriendPage() {
  return (
    <Container className="py-16 px-4 max-w-3xl">
      <h1 className="text-3xl font-semibold tracking-tight">Friends</h1>
      <p className="mt-3 text-muted-foreground">
        A list of friends, partners, and places we hang out on the web.
      </p>

      <ul className="mt-8 space-y-3">
        {friends.map((friend) => (
          <li key={friend.url}>
            <a
              href={friend.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-base text-foreground hover:text-primary underline-offset-4 hover:underline break-all"
            >
              {friend.name}
              <span className="ml-2 text-sm text-muted-foreground">
                {friend.url}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Container>
  );
}
