import type { CSSProperties } from "react";

type DoctorPhotoOverride = {
  objectPosition: string;
  /** Frame taller than the card, top-aligned — parent overflow clips the bottom. */
  tallFrameHeightPercent?: number;
};

/** Overrides for static seed portraits in public/doctors only — not slug-based. */
const DOCTOR_PHOTO_OVERRIDES: Record<string, DoctorPhotoOverride> = {
  "eros-reyes-cabrera-RtakOBTTdvY-unsplash.jpg": { objectPosition: "50% 28%" },
  "ike-ellyana-1KK4zX7g5XE-unsplash.jpg": { objectPosition: "50% 24%" },
  "siednji-leon-fkgsW3bhFzU-unsplash.jpg": { objectPosition: "50% 30%" },
  "vaibhav-vivian-3HIroMoyre8-unsplash.jpg": {
    objectPosition: "50% 0%",
    tallFrameHeightPercent: 120,
  },
  "vidak-5vfc-1KQLtE-unsplash.jpg": { objectPosition: "50% 38%" },
};

function photoFilename(profilePhotoUrl: string | null | undefined): string | null {
  if (!profilePhotoUrl?.trim()) return null;
  const segment = profilePhotoUrl.trim().split("/").pop();
  return segment && segment.length > 0 ? segment : null;
}

function getDoctorPhotoOverride(
  profilePhotoUrl?: string | null,
): DoctorPhotoOverride | undefined {
  const filename = photoFilename(profilePhotoUrl);
  if (!filename) return undefined;
  return DOCTOR_PHOTO_OVERRIDES[filename];
}

export function getDoctorPhotoObjectPosition(
  _slug: string | null | undefined,
  profilePhotoUrl?: string | null,
): string | undefined {
  return getDoctorPhotoOverride(profilePhotoUrl)?.objectPosition;
}

export function getDoctorPhotoImageProps(
  slug: string | null | undefined,
  profilePhotoUrl?: string | null,
): {
  className: string;
  style?: CSSProperties;
  tallFrameHeightPercent?: number;
} {
  const override = getDoctorPhotoOverride(profilePhotoUrl);

  if (!override) {
    return { className: "object-cover object-top" };
  }

  return {
    className: "object-cover",
    style: { objectPosition: override.objectPosition },
    tallFrameHeightPercent: override.tallFrameHeightPercent,
  };
}
