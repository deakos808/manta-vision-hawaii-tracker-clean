import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminSetPassword, generatePassword } from "@/lib/adminApi";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export default function PasswordCell({ userId, email }: { userId: string; email?: string | null }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const onGenerate = () => setPw(generatePassword(16));

  const onCopy = async () => {
    try { await navigator.clipboard.writeText(pw); } catch {}
  };

  const onSet = async () => {
    const npw = pw.trim();
    if (!npw) { alert("Enter or generate a password first."); return; }
    setBusy(true);
    try {
      await adminSetPassword(String(userId), npw);
      alert(`Password set.\n\n${email ? `Email: ${email}\n` : ""}Password:\n${npw}\n\nCopy and send it to the user.`);
      setPw("");
      setShow(false);
      setOpen(false);
    } catch (e: any) {
      alert(`Failed to set password: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        Set…
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setPw(""); setShow(false); setBusy(false);} }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Password{email ? ` — ${email}` : ""}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="flex gap-2">
              <Input
                type={show ? "text" : "password"}
                placeholder="New password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={onGenerate} disabled={busy}>
                Generate
              </Button>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setShow(s=>!s)} disabled={!pw || busy}>
                {show ? "Hide" : "Show"}
              </Button>
              <Button type="button" variant="outline" onClick={onCopy} disabled={!pw || busy}>
                Copy
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button type="button" onClick={onSet} disabled={!pw || busy}>
              {busy ? "Setting…" : "Set Password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
