import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

type FunctionResult = {
  processed?: number;
  updated?: number;
  skipped?: number;
  error?: string;
};

export default function UpdateCatalogEmbeddingsButton() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  async function handleClick() {
    setRunning(true);
    setProgress(5);
    setMessage("");

    try {
      const { data, error } = await supabase.functions.invoke<FunctionResult>("embeddings-catalog", {
        body: { limit: 100 },
      });

      if (error) {
        throw new Error(error.message || "embeddings-catalog function failed");
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setProgress(100);
      setMessage(
        `Done. Processed ${data?.processed ?? 0}, updated ${data?.updated ?? 0}, skipped ${data?.skipped ?? 0}.`,
      );
    } catch (error) {
      setProgress(null);
      setMessage(`Update failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleClick} disabled={running}>
        {running ? "Updating..." : "Update Catalog Embeddings"}
      </Button>
      {progress != null ? <Progress value={progress} /> : null}
      {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
    </div>
  );
}
