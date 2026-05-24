import Container from '@/components/layout/container';
import type { PropsWithChildren } from 'react';

export default function BlogPostLayout({ children }: PropsWithChildren) {
  return (
    <Container className="max-w-7xl py-8 px-6 sm:px-8 lg:px-10">
      <div className="mx-auto w-full">{children}</div>
    </Container>
  );
}
