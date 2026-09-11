"use client";

import { useEffect, useRef } from "react";

const OPEN_MENU_SELECTOR = "details[data-dismissible-menu][open]";

/** One outside-click listener closes every open menu inside the returned root. */
export function useDismissibleMenus() {
  const menuRootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeMenusOutsideClick(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;

      const openMenus = menuRootRef.current?.querySelectorAll<HTMLDetailsElement>(
        OPEN_MENU_SELECTOR,
      );
      for (const menu of openMenus ?? []) {
        if (!menu.contains(target)) menu.open = false;
      }
    }

    document.addEventListener("pointerdown", closeMenusOutsideClick);
    return () => document.removeEventListener("pointerdown", closeMenusOutsideClick);
  }, []);

  return menuRootRef;
}
