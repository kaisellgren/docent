import type { ReactNode } from 'react';
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';
import { appShell } from '@/styles/app.css';

export const Route = createRootRoute({
  head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Docent — internal knowledge base' }], links: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }] }),
  component: RootComponent,
});

function RootComponent() { return <RootDocument><main className={appShell}><Outlet /></main></RootDocument>; }
function RootDocument({ children }: Readonly<{ children: ReactNode }>) { return <html lang="en"><head><HeadContent /></head><body>{children}<Scripts /></body></html>; }
