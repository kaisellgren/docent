import { createFileRoute } from '@tanstack/react-router';
import { beginGoogleSignIn } from '@/server/auth';

export const Route = createFileRoute('/auth/google')({
  server: {
    handlers: {
      GET: () => new Response(null, { status: 302, headers: { Location: beginGoogleSignIn() } }),
    },
  },
});
