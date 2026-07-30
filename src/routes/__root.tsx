import type { ReactNode } from 'react';
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router';
import { AppFooter } from '@/components/navigation';
import { appShell } from '@/styles/app.css';

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'Docent — internal knowledge base' }],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap' },
      { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    ],
  }),
  component: RootComponent,
});

function RootComponent() { return <RootDocument><main className={appShell}><Outlet /><AppFooter /></main></RootDocument>; }
function RootDocument({ children }: Readonly<{ children: ReactNode }>) { return <html lang="en"><head><HeadContent /></head><body>{children}<Scripts /></body></html>; }
