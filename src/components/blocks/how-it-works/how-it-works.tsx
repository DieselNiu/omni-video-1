import { websiteConfig } from '@/config/website';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { Fragment } from 'react';

export default function HowItWorksSection() {
  const t = useTranslations('HowItWorks');
  const contentKey = websiteConfig.siteType === 'video' ? 'video' : 'image';

  const steps = [
    {
      number: '01',
      title: t(`${contentKey}.step1.title`),
      description: t(`${contentKey}.step1.description`),
    },
    {
      number: '02',
      title: t(`${contentKey}.step2.title`),
      description: t(`${contentKey}.step2.description`),
    },
    {
      number: '03',
      title: t(`${contentKey}.step3.title`),
      description: t(`${contentKey}.step3.description`),
    },
  ];

  return (
    <section className="bg-[#fafafa] py-20 lg:py-32">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4">
            {t(`${contentKey}.title`)}
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            {t(`${contentKey}.subtitle`)}
          </p>
        </div>

        <div className="flex flex-col lg:flex-row lg:items-stretch justify-center gap-8 lg:gap-4 max-w-6xl mx-auto">
          {steps.map((step, index) => (
            <Fragment key={step.number}>
              <div className="flex-1 lg:basis-0 text-center bg-primary/10 rounded-2xl p-8 lg:p-10 min-h-[280px] flex flex-col items-center justify-center">
                <div className="text-5xl font-bold text-primary mb-4">
                  {step.number}
                </div>
                <h3 className="text-xl lg:text-2xl font-semibold mb-3">
                  {step.title}
                </h3>
                <p className="text-muted-foreground">{step.description}</p>
              </div>

              {index < steps.length - 1 && (
                <div className="hidden lg:flex flex-shrink-0 items-center">
                  <Image
                    src="/svg/arrow.svg"
                    alt="arrow"
                    width={40}
                    height={40}
                    className="text-muted-foreground"
                  />
                </div>
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}
