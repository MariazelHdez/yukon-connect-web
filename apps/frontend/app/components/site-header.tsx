import Link from 'next/link';
export function SiteHeader() { return <header className="site-header"><div className="site-container header-inner"><Link className="logo" href="/"><span>Yukon</span> Connect</Link><nav><Link href="/">Home</Link><Link href="/fiscal-year-trend">Reports</Link><Link href="/search">Search</Link><Link href="/contact">Contact</Link></nav></div></header>; }
