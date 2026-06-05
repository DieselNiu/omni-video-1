import { websiteConfig } from '@/config/website';
import { LocaleLink } from '@/i18n/navigation';
import { Clapperboard } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

export default function CallToActionSection() {
  const t = useTranslations('HomePage.calltoaction');
  const contentKey = websiteConfig.siteType === 'video' ? 'video' : 'image';

  return (
    <section
      id="call-to-action"
      className="relative overflow-hidden bg-[#fafafa] px-4 py-16 md:py-[200px]"
    >
      <div className="absolute inset-0">
        <Image
          src="/openmusic-wanna-try-bg.png"
          alt=""
          fill
          sizes="100vw"
          className="h-full w-full"
        />
      </div>

      <div className="relative mx-auto flex max-w-[640px] flex-col items-center gap-6 md:gap-9">
        <div className="flex w-full flex-col items-center gap-3 text-center md:gap-5">
          <h2 className="text-3xl font-bold leading-tight text-slate-950 md:text-6xl md:leading-[1.125]">
            {t(`${contentKey}.title`)}
          </h2>
          <p className="text-base font-medium leading-6 text-slate-800 md:text-xl md:leading-[30px]">
            {t(`${contentKey}.description`)}
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 md:gap-5">
          <div className="flex justify-center">
            <LocaleLink
              href="/#hero"
              className="inline-flex items-center gap-2 rounded-[999px] bg-[#6359a6] px-8 py-3.5 text-lg font-medium text-white transition-colors hover:bg-[#564d8c] active:bg-[#4b4379]"
            >
              <span className="inline-flex items-center gap-2">
                <Clapperboard className="h-6 w-6" aria-hidden="true" />
                <span className="text-left text-base font-semibold">
                  {t(`${contentKey}.primaryButton`)}
                </span>
              </span>
            </LocaleLink>
          </div>

          <p className="text-sm font-medium leading-5 text-neutral-800 md:text-base md:leading-6">
            {t(`${contentKey}.secondaryButton`)}
          </p>
        </div>
      </div>
    </section>
  );
}
