'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  toggleCollapsed: () => void;
  mobileOpen: boolean;
  setMobileOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  toggleMobileOpen: () => void;
  closeMobile: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  collapsed: false,
  setCollapsed: () => {},
  toggleCollapsed: () => {},
  mobileOpen: false,
  setMobileOpen: () => {},
  toggleMobileOpen: () => {},
  closeMobile: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('autograde_sidebar_collapsed');
      if (saved !== null) {
        setCollapsedState(saved === 'true');
      }
    } catch {
      // ignore in SSR or restricted storage environments
    }
  }, []);

  const setCollapsed = (val: boolean | ((prev: boolean) => boolean)) => {
    setCollapsedState((prev) => {
      const next = typeof val === 'function' ? val(prev) : val;
      try {
        localStorage.setItem('autograde_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const toggleCollapsed = () => setCollapsed((prev) => !prev);
  const toggleMobileOpen = () => setMobileOpen((prev) => !prev);
  const closeMobile = () => setMobileOpen(false);

  return (
    <SidebarContext.Provider
      value={{
        collapsed,
        setCollapsed,
        toggleCollapsed,
        mobileOpen,
        setMobileOpen,
        toggleMobileOpen,
        closeMobile,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export const useSidebar = () => useContext(SidebarContext);
