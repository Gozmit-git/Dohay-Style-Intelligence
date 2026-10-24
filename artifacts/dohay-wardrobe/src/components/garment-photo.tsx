import { Shirt } from "lucide-react";
import { imageUrl } from "../lib/mvp-utils";

type Props = { path?: string | null; alt: string; className?: string };

export function GarmentPhoto({ path, alt, className = "" }: Props) {
  const src = imageUrl(path);
  if (!src) return <div className={`garment-photo-fallback ${className}`} aria-label={alt}><Shirt size={25} strokeWidth={1.3} /></div>;
  return <img className={className} src={src} alt={alt} loading="lazy" />;
}
