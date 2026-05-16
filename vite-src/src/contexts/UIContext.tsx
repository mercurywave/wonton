import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useEffect,
  useMemo,
} from "react";
import { Page } from "../types/chat";

const MOBILE_BREAKPOINT = 768;

interface UIContextValue {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  isMobile: boolean;
  navigate: (page: Page) => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [currentPage, setCurrentPage] = useState<Page>("chat");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= MOBILE_BREAKPOINT);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
      setIsMobile(mobile);
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const navigate = useCallback(
    (page: Page) => {
      setCurrentPage(page);
      if (isMobile) {
        setSidebarOpen(false);
      }
    },
    [isMobile]
  );

  const value = useMemo(
    () => ({
      currentPage,
      setCurrentPage,
      sidebarOpen,
      setSidebarOpen,
      isMobile,
      navigate,
    }),
    [currentPage, sidebarOpen, isMobile, navigate]
  );

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext);
  if (!ctx) {
    throw new Error("useUI must be used within a UIProvider");
  }
  return ctx;
}
