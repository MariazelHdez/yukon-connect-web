import { notFound } from 'next/navigation';
import { ReportPage } from '../components/report-page';
import { SiteHeader } from '../components/site-header';
import { SiteFooter } from '../components/site-footer';
import { getPageBySlug } from '../lib/strapi';
export default async function DynamicPage({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const page = await getPageBySlug(slug); if (!page) notFound(); return <><SiteHeader/><ReportPage page={page}/><SiteFooter footer={page.footer}/></>; }
