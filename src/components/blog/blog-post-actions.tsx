'use client';

import { Button } from '@/components/ui/button';
import { CheckIcon, CopyIcon, TwitterIcon } from 'lucide-react';
import { useEffect, useState } from 'react';

interface BlogPostActionsProps {
  title: string;
}

export function BlogPostActions({ title }: BlogPostActionsProps) {
  const [copied, setCopied] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');

  useEffect(() => {
    setCurrentUrl(window.location.href);
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(currentUrl || window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    title
  )}&url=${encodeURIComponent(currentUrl)}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-full"
        onClick={handleCopy}
      >
        {copied ? (
          <CheckIcon className="mr-2 size-4" />
        ) : (
          <CopyIcon className="mr-2 size-4" />
        )}
        {copied ? 'Copied' : 'Copy link'}
      </Button>
      <Button asChild variant="outline" size="sm" className="rounded-full">
        <a href={shareUrl} target="_blank" rel="noreferrer">
          <TwitterIcon className="mr-2 size-4" />
          Share on X
        </a>
      </Button>
    </div>
  );
}
