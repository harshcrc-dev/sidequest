import { useState } from "react";

// Renders an image and, if it fails, a designed gradient tile so the layout
// never breaks and the product still feels intentional.
export function Img({
  src,
  alt,
  className,
  eager,
}: {
  src: string;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <div className={`img-fallback ${className ?? ""}`} aria-label={alt} role="img" />;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
