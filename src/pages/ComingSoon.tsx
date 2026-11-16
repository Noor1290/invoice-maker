import { Page, PageHeader } from '@/components/layout/AppShell';
import { Callout } from '@/components/ui/misc';

export function ComingSoon({ title, phase }: { title: string; phase: number }) {
  return (
    <Page>
      <PageHeader title={title} />
      <Callout tone="info">This screen arrives in Phase {phase}.</Callout>
    </Page>
  );
}
