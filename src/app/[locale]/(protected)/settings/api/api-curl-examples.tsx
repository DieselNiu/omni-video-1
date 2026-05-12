'use client';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

function buildSubmitCurl(origin: string): string {
  return `curl -X POST ${origin}/api/v1/images/submit \\
  -H "Authorization: Bearer $GPTIMAGE_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "prompt": "a red fox in a snowy forest, cinematic lighting",
    "size": "16:9",
    "resolution": "2k"
  }'`;
}

function buildQueryCurl(origin: string): string {
  return `curl ${origin}/api/v1/images/a1b2c3d4-... \\
  -H "Authorization: Bearer $GPTIMAGE_API_KEY"`;
}

const SUBMIT_RESPONSE = `{ "task_id": "a1b2c3d4-...", "status": "processing", "credits_used": 1 }`;

const QUERY_RESPONSE = `{
  "task_id": "a1b2c3d4-...",
  "status": "completed",
  "images": ["https://cdn.example.com/..."],
  "error_message": null,
  "created_at": "2026-01-01T00:00:00Z",
  "updated_at": "2026-01-01T00:00:30Z"
}`;

interface CodeBlockProps {
  code: string;
  copyLabel: string;
  copiedLabel: string;
  ariaLabel: string;
}

function CodeBlock({
  code,
  copyLabel,
  copiedLabel,
  ariaLabel,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(copiedLabel);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('copy error:', error);
    }
  };

  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md border bg-muted p-4 text-xs leading-relaxed">
        <code>{code}</code>
      </pre>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label={ariaLabel}
        className="absolute right-2 top-2 cursor-pointer"
        onClick={handleCopy}
      >
        {copied ? (
          <CheckIcon className="size-4" />
        ) : (
          <CopyIcon className="size-4" />
        )}
        <span className="sr-only">{copyLabel}</span>
      </Button>
    </div>
  );
}

export function ApiCurlExamples() {
  const t = useTranslations('Dashboard.settings.api');
  const [origin, setOrigin] = useState<string>(
    process.env.NEXT_PUBLIC_BASE_URL || 'https://your-domain.com'
  );

  useEffect(() => {
    if (typeof window !== 'undefined' && !process.env.NEXT_PUBLIC_BASE_URL) {
      setOrigin(window.location.origin);
    }
  }, []);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          {t('curl.title')}
        </CardTitle>
        <CardDescription>{t('curl.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="submit" className="w-full">
          <TabsList>
            <TabsTrigger value="submit">{t('curl.submitTab')}</TabsTrigger>
            <TabsTrigger value="query">{t('curl.queryTab')}</TabsTrigger>
          </TabsList>

          <TabsContent value="submit" className="mt-4 space-y-3">
            <CodeBlock
              code={buildSubmitCurl(origin)}
              copyLabel={t('copy')}
              copiedLabel={t('copied')}
              ariaLabel={t('copy')}
            />
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {t('curl.response')}
            </p>
            <CodeBlock
              code={SUBMIT_RESPONSE}
              copyLabel={t('copy')}
              copiedLabel={t('copied')}
              ariaLabel={t('copy')}
            />
          </TabsContent>

          <TabsContent value="query" className="mt-4 space-y-3">
            <CodeBlock
              code={buildQueryCurl(origin)}
              copyLabel={t('copy')}
              copiedLabel={t('copied')}
              ariaLabel={t('copy')}
            />
            <p className="text-xs font-medium uppercase text-muted-foreground">
              {t('curl.response')}
            </p>
            <CodeBlock
              code={QUERY_RESPONSE}
              copyLabel={t('copy')}
              copiedLabel={t('copied')}
              ariaLabel={t('copy')}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
