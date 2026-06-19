"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

export function NavLink({
  href,
  className,
  children,
  onClick,
  showProgress = false,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  showProgress?: boolean;
}) {
  const [showBar, setShowBar] = useState(false);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    if (showBar && pathname !== pathnameRef.current) {
      setShowBar(false);
    }
    pathnameRef.current = pathname;
  }, [pathname, showBar]);

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (showProgress) {
      setShowBar(true);
    }
    onClick?.();
  }

  return (
    <>
      {showBar && (
        <div
          className="pointer-events-none fixed left-0 top-0 z-[99] h-0.5 w-full bg-[#2555F3]/15"
          aria-hidden
        >
          <div className="h-full w-[35%] bg-[#2555F3]" />
        </div>
      )}
      <Link href={href} className={className} onClick={handleClick}>
        {children}
      </Link>
    </>
  );
}
