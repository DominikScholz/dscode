import { useEffect, useEffectEvent } from "react";

import { useSidebar } from "../ui/sidebar";

/**
 * Digest pages use the whole window, so the thread sidebar closes while one is open.
 * Stays mounted across consecutive digests, and reopens the sidebar on leaving only
 * if it closed it.
 */
export function DigestSidebarCollapse() {
  const { isMobile, open, setOpen } = useSidebar();
  const collapse = useEffectEvent(() => {
    if (isMobile || !open) return false;
    void setOpen(false);
    return true;
  });
  const restore = useEffectEvent(() => void setOpen(true));
  useEffect(() => {
    if (!collapse()) return;
    return () => restore();
  }, []);
  return null;
}
