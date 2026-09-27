import Link from "next/link";
export default function NotFound() {
  return <main className="page-pad"><p className="eyebrow">404 / KNOWLEDGE HUB</p><h1>This page is unavailable.</h1><p>Check the source link or choose an equipment record.</p><Link href="/equipment">Equipment directory</Link></main>;
}
