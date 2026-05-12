'use client';

import { Button } from '@/components/ui/button';
import { ImageIcon, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function EmptyState() {
  const t = useTranslations('AIWorkspace');

  const handleStartCreating = () => {
    const promptArea = document.querySelector<HTMLTextAreaElement>(
      'textarea[name="prompt"], textarea'
    );
    if (promptArea) {
      promptArea.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Inject a style tag for highlight (survives React re-renders)
      const styleId = 'empty-state-highlight';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent =
          'textarea[data-highlight] { outline: 2px solid #a3e635 !important; outline-offset: 2px !important; }';
        document.head.appendChild(style);
      }
      setTimeout(() => {
        promptArea.focus();
        promptArea.setAttribute('data-highlight', '');
        setTimeout(() => {
          promptArea.removeAttribute('data-highlight');
        }, 1500);
      }, 400);
    }
  };

  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-4">
      <div className="bg-secondary flex size-12 items-center justify-center rounded-full">
        <ImageIcon className="text-muted-foreground size-6" />
      </div>
      <p className="text-muted-foreground text-sm">{t('noCreations')}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={handleStartCreating}
        className="gap-2"
      >
        <Sparkles className="size-4" />
        {t('startCreating')}
      </Button>
    </div>
  );
}
