import { useEffect, useState } from "react";

export default function BackToTopButton() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;

  return (
    <button
      type="button"
      className="fixed bottom-6 right-6 z-50 rounded-full bg-blue-600 text-white shadow-lg px-4 py-3 text-sm hover:bg-blue-700"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      title="Back to top"
      aria-label="Back to top"
    >
      ↑
    </button>
  );
}
