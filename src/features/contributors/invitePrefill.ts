export function invitePrefill(search: string) {
  const params = new URLSearchParams(search);
  const plain = (key: string, max: number) => (params.get(key) ?? '').replace(/[<>\u0000-\u001f\u007f]/g, '').slice(0, max).trim();
  const email = plain('email', 254).toLowerCase();
  return { email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '', displayName: plain('displayName', 120), reason: plain('reason', 500) };
}
export function contributorInviteLink(request: { id: string; email: string; full_name: string }) {
  return `/admin/users/invite?${new URLSearchParams({ email: request.email, displayName: request.full_name, reason: 'Contributor access approved', requestId: request.id })}`;
}
