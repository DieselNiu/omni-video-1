import { Button } from '@/components/ui/button';
import { LocaleLink } from '@/i18n/navigation';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function HomeVideoShowcase() {
  const t = useTranslations('HomePage.videoShowcase');

  const stats = [
    { value: t('stat1Value'), label: t('stat1Label') },
    { value: t('stat2Value'), label: t('stat2Label') },
    { value: t('stat3Value'), label: t('stat3Label') },
  ];

  return (
    <section className="py-12 lg:py-16">
      <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
        {/* Card-style container wrapping copy + video */}
        <div className="relative overflow-hidden rounded-3xl border bg-card/50 p-6 shadow-sm sm:p-10 lg:p-14">
          {/* subtle background glow */}
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-primary/5 blur-3xl" />

          <div className="relative grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            {/* Left: copy */}
            <div className="space-y-6">
              {/* badge */}
              <div className="inline-flex items-center gap-2 rounded-full border bg-background/60 px-3 py-1 text-sm">
                <span className="flex items-center gap-1 font-semibold text-primary">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t('badge')}
                </span>
                <span className="text-muted-foreground">{t('badgeText')}</span>
              </div>

              <h1 className="text-balance text-4xl font-bold leading-[1.1] sm:text-5xl md:text-6xl">
                {t('title')}
              </h1>

              <p className="max-w-xl text-balance text-base leading-relaxed text-muted-foreground sm:text-lg">
                {t('description')}
              </p>

              {/* CTAs */}
              <div className="flex flex-wrap items-center gap-4 pt-1">
                <Button asChild size="lg" className="font-semibold">
                  <LocaleLink href="/#hero">
                    <span>{t('primaryButton')}</span>
                    <Sparkles className="ml-1 h-4 w-4" />
                  </LocaleLink>
                </Button>
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="font-semibold"
                >
                  <a href="#use-cases">
                    <span>{t('secondaryButton')}</span>
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </a>
                </Button>
              </div>

              {/* stats */}
              <div className="flex flex-wrap gap-8 pt-2">
                {stats.map((stat) => (
                  <div key={stat.label}>
                    <div className="text-2xl font-bold sm:text-3xl">
                      {stat.value}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {stat.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: showcase video */}
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl border bg-background shadow-lg">
              <video
                src="https://assets.gemini-omni.video/landingpage/showcase-20260605-061301-opt.mp4"
                poster="https://assets.gemini-omni.video/landingpage/showcase-20260605-061301-poster.webp"
                autoPlay
                loop
                muted
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
