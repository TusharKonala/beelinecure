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
  const [progress, setProgress] = useState(false);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);

  useEffect(() => {
    if (progress && pathname !== pathnameRef.current) {
      setProgress(false);
    }
    pathnameRef.current = pathname;
  }, [pathname, progress]);

  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    if (showProgress) {
      setProgress(true);
    }
    onClick?.();
  }

  return (
    <>
      {progress && (
        <div
          className="pointer-events-none fixed left-0 top-0 z-[99] h-0.5 w-full overflow-hidden"
          aria-hidden
        >
          <div className="nav-link-progress h-full bg-[#2555F3]" />
        </div>
      )}
      <Link href={href} className={className} onClick={handleClick}>
        {children}
      </Link>
    </>
  );
}
