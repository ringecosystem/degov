import { createFileRoute } from '@tanstack/react-router';
import NotFound from '@/components/not-found';
import Error from '@/components/error';
import { HomePage } from '@/pages/Profile';

export const Route = createFileRoute('/profile/')({
  component: () => <HomePage />,
  notFoundComponent: () => <NotFound />,
  errorComponent: () => <Error />
});
