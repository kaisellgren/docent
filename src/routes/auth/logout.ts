import { createFileRoute } from '@tanstack/react-router';
import { clearSession } from '@/server/auth';

export const Route = createFileRoute('/auth/logout')({
  server: {
    handlers: {
      POST: ({ request }) => {
        clearSession();
        return new Response(null, { status: 303, headers: { Location: new URL('/', request.url).toString() } });
      },
    },
  },
});
