"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <main className="page-pad"><h1>The workspace could not load.</h1><p>No changes were confirmed. Retry, or return to sign in if your session expired.</p><Button onClick={retry}>Try again</Button> <Link href="/login">Sign in</Link></main>;
}
