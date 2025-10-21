import { useEffect } from "react";
import { saveReviewServer } from "@/utils/reviewSave";

export function useInjectAdminSave() {
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const reviewId = params.get("review");
      if (!reviewId) return;

      const handleSave = async (ev?: Event) => {
        try { ev?.preventDefault?.(); } catch {}
        try {
          await saveReviewServer(reviewId);
          const w: any = window as any;
          if (w.toast?.success) w.toast.success("Saved");
          else alert("Saved ✓");
        } catch (err) {
          console.error("Save failed", err);
          const w: any = window as any;
          if (w.toast?.error) w.toast.error("Save failed");
          else alert("Save failed");
        }
      };

      const inject = () => {
        if (document.querySelector('[data-admin-save="1"]')) return;

        const nodes = Array.from(document.querySelectorAll<HTMLElement>("a,button,[role='button']"));
        const norm = (el: Element) => (el.textContent || "").replace(/\s+/g, " ").trim();
        const byText = (re: RegExp) => nodes.find(el => re.test(norm(el)));

        const cancelBtn = byText(/^\s*Cancel\s*$/i);
        const commitBtn = byText(/^\s*Commit\s+Review\s*$/i);

        if (!cancelBtn && !commitBtn) return;

        const btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("data-admin-save", "1");
        btn.textContent = "Save Changes";

        const copyFrom = commitBtn || cancelBtn;
        if (copyFrom) btn.className = (copyFrom as HTMLElement).className;

        btn.addEventListener("click", handleSave);

        if (commitBtn) {
          commitBtn.insertAdjacentElement("beforebegin", btn);
        } else if (cancelBtn) {
          cancelBtn.insertAdjacentElement("afterend", btn);
        }
      };

      inject();
      const mo = new MutationObserver(inject);
      mo.observe(document.body, { childList: true, subtree: true });
      return () => mo.disconnect();
    } catch (e) {
      console.error("useInjectAdminSave failed", e);
    }
  }, []);
}

export default useInjectAdminSave;
