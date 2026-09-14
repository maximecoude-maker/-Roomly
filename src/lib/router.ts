import { useEffect, useState } from 'react';

function currentPath(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}

export function useHashPath(): string {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const onChange = () => {
      setPath(currentPath());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return path;
}

export function navigate(path: string, replace = false): void {
  if (replace) {
    window.location.replace(`#${path}`);
  } else {
    window.location.hash = path;
  }
}

export function goBack(fallback: string): void {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    navigate(fallback, true);
  }
}

/** Retourne les parametres si le chemin correspond au motif (ex : /i/:id/room/:roomId). */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i += 1) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}
