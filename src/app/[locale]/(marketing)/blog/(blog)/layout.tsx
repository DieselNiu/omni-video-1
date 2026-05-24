import Container from '@/components/layout/container';
import { getTranslations } from 'next-intl/server';
import type { PropsWithChildren } from 'react';

interface BlogListLayoutProps extends PropsWithChildren {
  params: Promise<{ locale: string }>;
}

export default async function BlogListLayout({
  children,
  params,
}: BlogListLayoutProps) {
  const t = await getTranslations('BlogPage');
  await params;

  return (
    <Container className="mb-16 max-w-7xl px-6 sm:px-8 lg:px-10">
      <div className="pt-8 w-full flex flex-col gap-10">
        <div className="space-y-6 text-center">
          <div className="text-sm text-muted-foreground">
            <span>home</span>
            <span className="mx-2">/</span>
            <span>blog</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight md:text-5xl">
            {t('title')}
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>

        {children}
      </div>
    </Container>
  );
}
