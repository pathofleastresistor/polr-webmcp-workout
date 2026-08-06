import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import stylesheet from "./app.css?url";
import { nonceContext } from "./server/nonce";
import { securityMiddleware } from "./server/security.server";
import { getOptionalUser } from "./server/session.server";
import { ConfirmationDialog } from "./webmcp/ConfirmationDialog";
import { WebMcpProvider } from "./webmcp/provider";

import type { Route } from "./+types/root";

/**
 * Runs on every request: rejects cross-origin mutations and stamps the security
 * headers, including the CSP whose nonce is threaded into `<Scripts>` below.
 */
export const middleware: Route.MiddlewareFunction[] = [securityMiddleware];

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
];

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = await getOptionalUser(request, context);

  return {
    nonce: context.get(nonceContext),
    user: user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          unitSystem: user.profile.unitSystem,
          experienceLevel: user.profile.experienceLevel,
          goal: user.profile.goal,
          timezone: user.profile.timezone,
          weeklyTargetSessions: user.profile.weeklyTargetSessions,
        }
      : null,
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  // Read defensively: when the root loader itself throws, the error boundary
  // still renders through this Layout with no loader data available.
  const data = useRouteLoaderData<typeof loader>("root");
  const nonce = data?.nonce;

  return (
    <html lang="en" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-full antialiased">
        <WebMcpProvider>
          {children}
          <ConfirmationDialog />
        </WebMcpProvider>
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let title = "Something went wrong";
  let detail =
    "An unexpected error occurred. Try again, and if it keeps happening the problem is on our side.";

  if (isRouteErrorResponse(error)) {
    title = error.status === 404 ? "Page not found" : `Error ${error.status}`;
    detail =
      error.status === 404
        ? "That page does not exist. Head back to the dashboard to pick up where you left off."
        : error.statusText || detail;
  } else if (import.meta.env.DEV && error instanceof Error) {
    // Stack traces are shown in development only — in production they would
    // leak server internals to anyone who can trigger an error.
    detail = error.message;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="text-slate-400">{detail}</p>
      <a
        href="/"
        className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400"
      >
        Back to start
      </a>
    </main>
  );
}
