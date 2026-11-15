import Image from "next/image";

import { cn } from "@/lib/utils";

/**
 * A public-domain plate (engraving or painting) with its credit line. The images live in
 * public/plates/; their sources and licences are listed in site/README.md. Without a
 * `src` the frame renders as plain paper, so the layout holds while an image is missing.
 */
export function Plate({
  src,
  alt,
  credit,
  width,
  height,
  priority = false,
  className,
  imgClassName,
  sizes = "(min-width: 1024px) 50vw, 100vw",
}: {
  src?: string;
  alt: string;
  credit: string;
  width: number;
  height: number;
  priority?: boolean;
  className?: string;
  imgClassName?: string;
  sizes?: string;
}) {
  return (
    <figure className={cn("flex flex-col", className)}>
      <div className="relative overflow-hidden rounded-2xl bg-muted">
        {src ? (
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            priority={priority}
            sizes={sizes}
            className={cn("h-full w-full object-cover", imgClassName)}
          />
        ) : (
          <div style={{ aspectRatio: `${width} / ${height}` }} aria-label={alt} role="img" />
        )}
      </div>
      <figcaption className="mt-3 text-xs leading-relaxed text-muted-foreground">{credit}</figcaption>
    </figure>
  );
}
