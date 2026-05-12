import { Button } from '@/components/ui/button';
import { websiteConfig } from '@/config/website';
import { LocaleLink } from '@/i18n/navigation';
import { ArrowRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function CallToActionSection() {
  const t = useTranslations('HomePage.calltoaction');
  const contentKey = websiteConfig.siteType === 'video' ? 'video' : 'image';

  return (
    <section
      id="call-to-action"
      className="px-4 py-24 bg-indigo-600 dark:bg-indigo-700"
    >
      <div className="mx-auto max-w-3xl px-6">
        <div className="text-center">
          <h2 className="text-balance text-4xl font-bold tracking-tight text-white lg:text-5xl">
            {t(`${contentKey}.title`)}
          </h2>
          <p className="mt-6 text-lg text-indigo-100/80">
            {t(`${contentKey}.description`)}
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button
              asChild
              size="lg"
              className="bg-white text-indigo-600 hover:bg-indigo-50 font-semibold"
            >
              <LocaleLink href="/">
                <span>{t(`${contentKey}.primaryButton`)}</span>
              </LocaleLink>
            </Button>

            <Button
              asChild
              size="lg"
              variant="ghost"
              className="text-white hover:bg-indigo-500/20 hover:text-white font-semibold"
            >
              <a href="#use-cases">
                <span>{t(`${contentKey}.secondaryButton`)}</span>
                <ArrowRight className="ml-1 h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
