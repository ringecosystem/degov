import Image from "next/image";

import { cn } from "@/lib/utils";

interface ThemedLogoProps {
  logoDark: string;
  logoLight: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}

/**
 * Select the logo from the document theme class instead of a client-side theme
 * value. This keeps the logo correct during SSR and while next-themes resolves
 * a system or custom theme after hydration.
 */
export function ThemedLogo({
  logoDark,
  logoLight,
  alt,
  width,
  height,
  className,
}: ThemedLogoProps) {
  const imageClassName = cn("themed-logo-image", className);

  return (
    <span className="themed-logo" role="img" aria-label={alt}>
      <Image
        src={logoLight}
        alt=""
        width={width}
        height={height}
        priority
        className={cn("themed-logo-light", imageClassName)}
      />
      <Image
        src={logoDark}
        alt=""
        width={width}
        height={height}
        priority
        className={cn("themed-logo-dark", imageClassName)}
      />
    </span>
  );
}
