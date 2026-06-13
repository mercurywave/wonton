import { useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./FeedbackPopup.module.css";
import { useFeedback } from "../contexts";

export default function FeedbackPopup() {
  const { currentRequest, currentPayload, dismiss } = useFeedback();
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentRequest) return;
    const request = currentRequest;

    function handleClickOutside(event: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        if (request.payload.type === "alert") {
          dismiss();
        }
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [currentRequest, dismiss]);

  if (!currentRequest || !currentPayload) return null;

  const { payload, resolve } = currentRequest;

  if (payload.type === "alert") {
    return (
      <div className={styles.overlay}>
        <div ref={popupRef} className={styles.popup}>
          <div className={styles.popupBody}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {payload.message}
            </ReactMarkdown>
          </div>
          <div className={styles.popupActions}>
            <button
              className={styles.okButton}
              onClick={() => {
                resolve(undefined);
                dismiss();
              }}
              type="button"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay}>
      <div ref={popupRef} className={styles.popup}>
        <div className={styles.popupBody}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {payload.question}
          </ReactMarkdown>
          <div className={styles.choices}>
            {payload.choices.map((choice: string, idx: number) => (
              <button
                key={idx}
                className={styles.choiceButton}
                onClick={() => {
                  resolve(idx);
                  dismiss();
                }}
                type="button"
              >
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {choice}
                </ReactMarkdown>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
