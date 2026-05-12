import { AnimatedGroup } from '@/components/tailark/motion/animated-group';
import { TextEffect } from '@/components/tailark/motion/text-effect';
import { Button } from '@/components/ui/button';
import { LocaleLink } from '@/i18n/navigation';
import { ArrowRight, ImageIcon, Type, Video } from 'lucide-react';
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

export default function HeroSection() {
  const t = useTranslations('HomePage.hero');
  const linkPrimary = '/#pricing';

  return (
    <main id="hero" className="overflow-hidden">
      {/* background decorative elements */}
      <div
        aria-hidden
        className="absolute inset-0 isolate hidden opacity-65 contain-strict lg:block"
      >
        <div className="w-140 h-320 -translate-y-87.5 absolute left-0 top-0 -rotate-45 rounded-full bg-[radial-gradient(68.54%_68.72%_at_55.02%_31.46%,hsla(0,0%,85%,.08)_0,hsla(0,0%,55%,.02)_50%,hsla(0,0%,45%,0)_80%)]" />
        <div className="h-320 absolute left-0 top-0 w-60 -rotate-45 rounded-full bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.06)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)] [translate:5%_-50%]" />
        <div className="h-320 -translate-y-87.5 absolute left-0 top-0 w-60 -rotate-45 bg-[radial-gradient(50%_50%_at_50%_50%,hsla(0,0%,85%,.04)_0,hsla(0,0%,45%,.02)_80%,transparent_100%)]" />
      </div>

      <section>
        <div className="relative pt-16 pb-12 sm:pt-24 sm:pb-16 lg:pt-32 lg:pb-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center space-y-6 sm:space-y-8 md:space-y-10">
              {/* title */}
              <TextEffect
                per="line"
                preset="fade-in-blur"
                speedSegment={0.3}
                as="h1"
                className="text-balance text-4xl font-bold font-bricolage-grotesque leading-tight sm:text-5xl md:text-6xl xl:text-7xl"
              >
                {t('title')}
              </TextEffect>

              {/* description */}
              <TextEffect
                per="line"
                preset="fade-in-blur"
                speedSegment={0.3}
                delay={0.5}
                as="p"
                className="mx-auto max-w-4xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg md:text-xl"
              >
                {t('description')}
              </TextEffect>

              {/* feature pills */}
              <AnimatedGroup
                variants={{
                  container: {
                    visible: {
                      transition: {
                        staggerChildren: 0.08,
                        delayChildren: 0.6,
                      },
                    },
                  },
                  ...transitionVariants,
                }}
                className="flex flex-wrap items-center justify-center gap-3"
              >
                <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-4 py-2 text-sm font-medium text-muted-foreground backdrop-blur-sm">
                  <ImageIcon className="size-4" />
                  <span>{t('pill1')}</span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-4 py-2 text-sm font-medium text-muted-foreground backdrop-blur-sm">
                  <Video className="size-4" />
                  <span>{t('pill2')}</span>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-4 py-2 text-sm font-medium text-muted-foreground backdrop-blur-sm">
                  <Type className="size-4" />
                  <span>{t('pill3')}</span>
                </div>
              </AnimatedGroup>

              {/* CTA button */}
              <AnimatedGroup
                variants={{
                  container: {
                    visible: {
                      transition: {
                        staggerChildren: 0.05,
                        delayChildren: 0.9,
                      },
                    },
                  },
                  ...transitionVariants,
                }}
                className="flex flex-col items-center justify-center gap-4 sm:flex-row"
              >
                <div
                  key={1}
                  className="bg-foreground/10 rounded-[calc(var(--radius-xl)+0.125rem)] border p-0.5"
                >
                  <Button
                    asChild
                    size="lg"
                    className="rounded-xl px-8 text-base"
                  >
                    <LocaleLink href={linkPrimary}>
                      <span className="text-nowrap">{t('primary')}</span>
                      <ArrowRight className="ml-2 size-4" />
                    </LocaleLink>
                  </Button>
                </div>
              </AnimatedGroup>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
