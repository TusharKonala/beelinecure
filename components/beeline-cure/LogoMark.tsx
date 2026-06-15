"use client";

import Image from "next/image";
import Link from "next/link";

const LOGO_SRC = "/brand/BeelineCure-Logo.svg";
const LOGO_INTRINSIC_WIDTH = 620;
const LOGO_INTRINSIC_HEIGHT = 485;
const LOGO_WIDTH_SCALE = 1.25;

function logoWidthForHeight(height: number) {
  return Math.round(
    height * (LOGO_INTRINSIC_WIDTH / LOGO_INTRINSIC_HEIGHT) * LOGO_WIDTH_SCALE,
  );
}

export function LogoMark({
  height,
  priority = false,
  naturalWidth = false,
}: {
  height: number;
  priority?: boolean;
  naturalWidth?: boolean;
}) {
  const width = naturalWidth
    ? Math.round(height * (LOGO_INTRINSIC_WIDTH / LOGO_INTRINSIC_HEIGHT))
    : logoWidthForHeight(height);

  return (
    <Link
      href="/"
      className="inline-flex shrink-0 items-center overflow-hidden rounded-xl leading-none transition-opacity hover:opacity-90 [&>span]:block [&>span]:leading-[0]"
    >
      <Image
        src={LOGO_SRC}
        alt="BeelineCure"
        width={LOGO_INTRINSIC_WIDTH}
        height={LOGO_INTRINSIC_HEIGHT}
        className="block object-contain"
        style={{ width, height, display: "block" }}
        priority={priority}
      />
    </Link>
  );
}
