'use client'

import { useEffect, useState } from "react";
import { getPrivateMenuMedia } from "@/services/menu";

export default function MenuImage({ id, alt, className }: { id: string; alt: string; className?: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    getPrivateMenuMedia(id, "thumb").then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => {});
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id]);
  if (!url) return null;
  return <span role="img" aria-label={alt} className={className} style={{ backgroundImage: `url(${JSON.stringify(url)})`, backgroundSize: "cover", backgroundPosition: "center" }} />;
}
