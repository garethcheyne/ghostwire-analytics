import { SupportView } from '@/components/support/support-view';

/** Public, read-only user timeline behind a support link. */
export default async function SupportPage({ params }: PageProps<'/support/[slug]'>) {
  const { slug } = await params;

  return <SupportView slug={slug} />;
}
