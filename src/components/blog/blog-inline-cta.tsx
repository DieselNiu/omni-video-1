import { LocaleLink } from '@/i18n/navigation';
import { ArrowRightIcon } from 'lucide-react';

export function BlogInlineCta() {
  return (
    <section className="my-10 rounded-xl border border-[#dededb] bg-[#fbfbfa] p-5 text-[#202020] shadow-[0_8px_30px_rgba(15,15,15,0.06)] ring-1 ring-white dark:border-white/10 dark:bg-white/[0.035] dark:text-foreground dark:shadow-black/20 dark:ring-white/5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">
            Ready to create your own AI video?
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Start from an image, prompt, or product scene in Gemini Omni.
          </p>
        </div>
        <LocaleLink
          href="/#hero"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-[#d6d6d2] bg-[#f1f1ef] px-4 text-sm font-medium text-[#202020] no-underline shadow-[0_1px_2px_rgba(15,15,15,0.08)] transition-colors hover:bg-[#e9e9e6] hover:text-[#202020] dark:border-white/15 dark:bg-white/10 dark:text-foreground dark:hover:bg-white/15"
        >
          Try Gemini Omni
          <ArrowRightIcon className="ml-2 size-4" />
        </LocaleLink>
      </div>
    </section>
  );
}
