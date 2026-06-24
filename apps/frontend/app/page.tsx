import { Homepage } from './components/homepage';
import { SiteFooter } from './components/site-footer';
import { getHomepage } from './lib/strapi';
export default async function HomePage() { const data = await getHomepage(); return <><Homepage data={data}/><SiteFooter footer={data.footer}/></>; }
