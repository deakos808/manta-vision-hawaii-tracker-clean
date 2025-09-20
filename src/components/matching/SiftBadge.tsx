import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { siftScore } from "@/lib/sift";

type Props = { aUrl?: string | null; bUrl?: string | null; className?: string };

export default function SiftBadge({ aUrl, bUrl, className }: Props) {
  const [state, setState] = useState<{loading:boolean; inliers?:number; ratio?:number; err?:string}>({loading:true});

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!aUrl || !bUrl) { setState({loading:false}); return; }
      try {
        setState({loading:true});
        const { inliers, inlier_ratio } = await siftScore(aUrl, bUrl);
        if (!cancelled) setState({loading:false, inliers, ratio: inlier_ratio});
      } catch (e:any) {
        if (!cancelled) setState({loading:false, err: e?.message || "error"});
      }
    }
    run();
    return () => { cancelled = true; };
  }, [aUrl, bUrl]);

  if (!aUrl || !bUrl) return null;
  if (state.loading) return <Badge variant="secondary" className={className}><Loader2 className="h-3 w-3 mr-1 animate-spin" /> geom…</Badge>;
  if (state.err) return <Badge variant="destructive" className={className}>geom err</Badge>;

  const pct = state.ratio != null ? Math.round(state.ratio * 100) : undefined;
  return (
    <Badge variant="secondary" className={className}>
      geom {state.inliers ?? 0}{pct != null ? ` • ${pct}%` : ""}
    </Badge>
  );
}
