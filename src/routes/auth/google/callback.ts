import { createFileRoute } from '@tanstack/react-router';
import { completeGoogleSignIn } from '@/server/auth';

export const Route = createFileRoute('/auth/google/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const error = url.searchParams.get('error');
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (error || !code || !state) return new Response('Google sign-in was cancelled or could not be completed.', { status: 400 });
        await completeGoogleSignIn(code, state);
        return new Response(null, { status: 302, headers: { Location: new URL('/', url).toString() } });
      },
    },
  },
});
