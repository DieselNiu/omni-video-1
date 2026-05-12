import { AnimatedGroup } from '@/components/tailark/motion/animated-group';
import { Button } from '@/components/ui/button';
import { LocaleLink } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

const transitionVariants = {
  item: {
    hidden: {
      opacity: 0,
      y: 12,
      scale: 0.95,
    },
    visible: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: {
        type: 'spring',
        bounce: 0.3,
        duration: 1.5,
      },
    },
  },
};

export default function AiDemoSection() {
  const t = useTranslations('HomePage.aiDemo');

  return (
    <section id="ai-demo" className="relative py-16 md:py-24">
      <div className="mx-auto max-w-7xl px-6">
        <AnimatedGroup variants={transitionVariants}>
          {/* Section Header */}
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="font-bricolage-grotesque text-3xl font-bold md:text-5xl">
              {t('title')}
            </h2>
            <p className="text-muted-foreground mt-4 text-lg md:text-xl">
              {t('description')}
            </p>
          </div>

          {/* Demo Frame */}
          <div className="mt-12 md:mt-16">
            <div className="bg-muted/50 ring-muted/50 dark:inset-shadow-white/20 relative mx-auto overflow-hidden rounded-2xl border p-4 shadow-lg shadow-zinc-950/15 ring-1 md:p-6">
              <div
                className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-xl"
                style={{ height: '1200px' }}
              >
                <iframe
                  src="https://linoyts-qwen-image-edit-angles.hf.space"
                  title="ChatGPT Image 2 Generator"
                  className="h-full w-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        </AnimatedGroup>
      </div>
    </section>
  );
}
