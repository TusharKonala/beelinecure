import Image, { type ImageProps } from "next/image";
import { getDoctorPhotoImageProps } from "@/lib/doctor-photo-position";
import { cn } from "@/lib/utils";

type DoctorProfilePhotoProps = Omit<ImageProps, "className" | "style"> & {
  slug?: string | null;
  className?: string;
};

export function DoctorProfilePhoto({
  slug,
  src,
  className,
  ...props
}: DoctorProfilePhotoProps) {
  const profilePhotoUrl = typeof src === "string" ? src : undefined;
  const { className: positionClassName, style, tallFrameHeightPercent } =
    getDoctorPhotoImageProps(slug, profilePhotoUrl);

  const image = (
    <Image
      src={src}
      className={cn(positionClassName, className)}
      style={style}
      {...props}
    />
  );

  if (!tallFrameHeightPercent) {
    return image;
  }

  return (
    <div
      className="absolute inset-x-0 top-0"
      style={{ height: `${tallFrameHeightPercent}%` }}
    >
      {image}
    </div>
  );
}
