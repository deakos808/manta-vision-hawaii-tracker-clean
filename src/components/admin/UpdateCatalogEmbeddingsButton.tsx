// src/components/admin/UpdateCatalogEmbeddingsButton.tsx   ← FULL FILE — ADD THIS
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

/**
 * Streams progress from the `embeddings-catalog` Edge Function.
 * Works even with verify_jwt = "true" by appending the user’s JWT
 * as ?authorization=Bearer+<token> to the EventSource URL.
 */
export default function UpdateCatalogEmbeddingsButton() {
  const [running, setRunning]   = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  async function handleClick() {
    setRunning(true);
    setProgress(0);

    // ── 1 ▸ grab current JWT
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      console.error("[UpdateCatalog] no user session");
      setRunning(false);
      return;
    }

    // ── 2 ▸ build EventSource URL with token in query param
    const fnUrl = supabase.functions.getUrl("embeddings
