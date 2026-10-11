import React, { forwardRef } from 'react';
import { useUser, useSupabaseClient } from '@supabase/auth-helpers-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { authenticatedPhotoUrl, mantaDisplayReference, freshSignedPhotoUrl } from './authenticatedPhotoUrl';

export function useMantaImageSource(src?: string | null, enabled = true): string | undefined {
  const user = useUser();
  const supabase = useSupabaseClient();
  const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;
  let reference: ReturnType<typeof mantaDisplayReference> = null;
  let invalid = false;
  try { reference = mantaDisplayReference(src, supabaseUrl!); } catch { invalid = true; }
  const query = useQuery({
    queryKey: ['manta-photo-display', user?.id, reference?.bucket, reference?.path],
    queryFn: () => authenticatedPhotoUrl(supabase, reference!, supabaseUrl!),
    enabled: enabled && !!user && !!reference,
    staleTime: 240_000, gcTime: 300_000, refetchInterval: 240_000,
    retry: false,
  });
  if (invalid) return '/manta-logo.svg';
  if (!reference) return src || undefined;
  if (!user) return undefined;
  // Never use the public URL as an authorization-error fallback.
  return query.isError ? '/manta-logo.svg' : freshSignedPhotoUrl(query.data, query.dataUpdatedAt);
}

type MantaImageProps = React.ImgHTMLAttributes<HTMLImageElement> & {
  loadingMode?: 'eager' | 'lazy';
};

export const MantaImage = forwardRef<HTMLImageElement, MantaImageProps>(
  function MantaImage({ src, onError, loadingMode = 'eager', style, ...props }, ref) {
    const element = React.useRef<HTMLImageElement | null>(null);
    const [activated, setActivated] = React.useState(false);
    React.useEffect(() => {
      if (loadingMode !== 'lazy' || activated) return;
      if (typeof IntersectionObserver === 'undefined') {
        setActivated(true);
        return;
      }
      const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          // Latch activation: leaving the viewport must not disable refresh or
          // discard the fresh user/bucket/path cache on subsequent re-entry.
          setActivated(true);
          observer.disconnect();
        }
      }, { rootMargin: '600px' });
      if (element.current) observer.observe(element.current);
      return () => observer.disconnect();
    }, [loadingMode, activated]);
    const queryClient = useQueryClient();
    const displaySrc = useMantaImageSource(src, loadingMode === 'eager' || activated);
    return <img {...props} ref={node => {
      element.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    }} src={displaySrc} style={displaySrc ? style : { ...style, visibility: 'hidden' }} onError={event => {
      // An unresolved/offscreen image has no request to fail.
      if (!displaySrc) return;
      // Lazy images can first request their URL after returning from background.
      // Refresh expired evidence before allowing a caller to latch its fallback.
      const cached = queryClient.getQueryCache().findAll({queryKey: ['manta-photo-display']})
        .find(q => q.state.data === displaySrc);
      if (displaySrc && cached && !freshSignedPhotoUrl(displaySrc, cached.state.dataUpdatedAt)) {
        void queryClient.invalidateQueries({queryKey: cached.queryKey, exact: true});
        return;
      }
      onError?.(event);
    }} />;
  },
);

export function MantaImageLink({ href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const displayHref = useMantaImageSource(href);
  return <a {...props} href={displayHref} />;
}
