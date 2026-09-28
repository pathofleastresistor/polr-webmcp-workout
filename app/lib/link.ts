import { useParams } from "react-router";

/**
 * Everything a person owns lives under `/w/<key>`. These build paths inside
 * the link the page is currently on, so nothing else has to carry the key.
 */
export function useLinkPath(): (path?: string) => string {
  const { key } = useParams();
  if (!key) throw new Error("useLinkPath used outside a /w/:key route");
  return (path = "") => `/w/${key}${path}`;
}

/** The same, for code that is not a component (the API client). */
export function currentLinkBase(): string {
  const match = /^\/w\/[^/]+/.exec(window.location.pathname);
  if (!match) throw new Error("Not on a Spotter link");
  return match[0];
}
