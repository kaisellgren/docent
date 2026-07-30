import { createFileRoute } from '@tanstack/react-router';
import { beginGoogleSignIn, googleSignInConfigurationProblem } from '@/server/auth';

export const Route = createFileRoute('/auth/google')({
  server: {
    handlers: {
      GET: () => {
        const problem = googleSignInConfigurationProblem();
        if (problem) return new Response(problem, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
        return new Response(null, { status: 302, headers: { Location: beginGoogleSignIn() } });
      },
    },
  },
});
