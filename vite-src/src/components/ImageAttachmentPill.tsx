import { useEffect, useRef, useState } from "react";
import { Image, X } from "lucide-react";
import { ImageAttachment } from "../types/chat";
import { readImageAttachment } from "../utils/imageAttachments";
import styles from "./ImageAttachmentPill.module.css";

export default function ImageAttachmentPill({ attachment, onRemove }: { attachment: ImageAttachment; onRemove?: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const active = useRef(false);
  const url = useRef<string | null>(null);
  const request = useRef(0);

  const hidePreview = () => {
    active.current = false;
    request.current += 1;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setPreview(null);
  };

  const showPreview = async () => {
    if (active.current) return;
    active.current = true;
    const requestId = ++request.current;
    setError(false);
    try {
      const blob = await readImageAttachment(attachment);
      if (!active.current || requestId !== request.current) return;
      url.current = URL.createObjectURL(blob);
      setPreview(url.current);
    } catch {
      if (active.current && requestId === request.current) setError(true);
    }
  };

  useEffect(() => () => {
    active.current = false;
    request.current += 1;
    if (url.current) URL.revokeObjectURL(url.current);
  }, []);

  return (
    <span className={styles.pill} onMouseEnter={showPreview} onMouseLeave={hidePreview} onFocus={showPreview} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) hidePreview();
    }} tabIndex={0} aria-label={`Image attachment: ${attachment.name}`}>
      <Image size={14} aria-hidden="true" />
      <span className={styles.name}>{attachment.name}</span>
      {onRemove && <button type="button" className={styles.remove} onClick={onRemove} title="Detach image" aria-label={`Detach ${attachment.name}`}><X size={14} /></button>}
      {(preview || error) && <span className={styles.preview} role="tooltip">
        {preview ? <img src={preview} alt={attachment.name} /> : "Image unavailable"}
      </span>}
    </span>
  );
}