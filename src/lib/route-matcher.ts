function normalizePath(path: string): string {
  if (!path) {
    return '/';
  }

  const normalized = path.replace(/\/+$/, '');
  return normalized || '/';
}

export function matchesRoute(pathname: string, route: string): boolean {
  const normalizedPathname = normalizePath(pathname);
  const normalizedRoute = normalizePath(route);

  if (normalizedRoute === '/') {
    return normalizedPathname === '/';
  }

  return (
    normalizedPathname === normalizedRoute ||
    normalizedPathname.startsWith(`${normalizedRoute}/`)
  );
}

export function matchesAnyRoute(pathname: string, routes: string[]): boolean {
  return routes.some((route) => matchesRoute(pathname, route));
}
