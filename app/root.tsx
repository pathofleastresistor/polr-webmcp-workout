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
import { requestContextMiddleware } from "./server/request-context.server";
import { securityMiddleware } from "./server/security.server";
import { ConfirmationDialog } from "./webmcp/ConfirmationDialog";
import { WebMcpProvider } from "./webmcp/provider";

import type { Route } from "./+types/root";

/**
 * Runs on every request. Order matters: the first builds the application
 * context and the CSP nonce, the second reads that config to reject
 * cross-origin mutations and stamp the security headers — including the CSP
 * whose nonce is threaded into `<Scripts>` below.
 */
export const middleware: Route.MiddlewareFunction[] = [
  requestContextMiddleware,
  securityMiddleware,
];

export const links: Route.LinksFunction = () => [
  {
    rel: "preload",
    href: "/fonts/Figtree-Variable.woff2",
    as: "font",
    type: "font/woff2",
    crossOrigin: "anonymous",
  },
  { rel: "stylesheet", href: stylesheet },
  { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
];

export function loader({ context }: Route.LoaderArgs) {
  return { nonce: context.get(nonceContext) };
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
      <body className="min-h-full bg-surface text-ink antialiased">
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
  let detail = "Try again. If it keeps happening, the problem is on our side.";

  if (isRouteErrorResponse(error)) {
    title =
      error.status === 404 ? "Nothing lives here" : `Error ${error.status}`;
    detail =
      error.status === 404
        ? "Check the link. If it is your Spotter link, make sure you copied all of it."
        : error.statusText || detail;
  } else if (import.meta.env.DEV && error instanceof Error) {
    // Stack traces are shown in development only — in production they would
    // leak server internals to anyone who can trigger an error.
    detail = error.message;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-start justify-center gap-4 px-4">
      <h1 className="display">{title}</h1>
      <p className="text-ink-muted">{detail}</p>
      <a href="/" className="btn btn-secondary mt-2">
        Go to the start
      </a>
    </main>
  );
}
