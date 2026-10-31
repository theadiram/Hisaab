'use client';

import { useEffect, useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import styles from './public-preview-gate.module.css';

const acknowledgementKey = 'hisaab-public-preview-project-data-2026-10-26';

export function PublicPreviewGate({
  children,
  assetRecordTotal = 812_976,
  projectDataSourceRecords = 330_080,
}: {
  children: ReactNode;
  assetRecordTotal?: number;
  projectDataSourceRecords?: number;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const card = useRef<HTMLElement>(null);
  const enter = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(acknowledgementKey) === 'understood') {
        setAcknowledged(true);
        return;
      }
    } catch {}
    enter.current?.focus();
  }, []);

  function acknowledge() {
    try {
      sessionStorage.setItem(acknowledgementKey, 'understood');
    } catch {}
    setAcknowledged(true);
    requestAnimationFrame(() => {
      const target = content.current?.querySelector<HTMLElement>('a, button') ?? content.current;
      target?.focus();
    });
  }

  function containFocus(event: KeyboardEvent<HTMLElement>) {
    if (event.key !== 'Tab') return;
    const controls = card.current?.querySelectorAll<HTMLElement>('button, a[href], summary');
    if (!controls?.length) return;
    const first = controls[0],
      last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <>
      <div ref={content} tabIndex={-1} inert={!acknowledged}>
        {acknowledged ? children : null}
      </div>
      {!acknowledged && (
        <div className={styles.backdrop}>
          <section
            ref={card}
            className={styles.card}
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-heading"
            aria-describedby="preview-intro"
            onKeyDown={containFocus}
          >
            <span className={styles.label}>HISAAB · PUBLIC PREVIEW</span>
            <h2 id="preview-heading">Hisaab is still under development.</h2>
            <p id="preview-intro">
              {assetRecordTotal.toLocaleString('en-IN')} archived asset records.
            </p>
            <section className={styles.projectCount} aria-labelledby="project-data-heading">
              <h2 id="project-data-heading">Project data collected</h2>
              <strong>{projectDataSourceRecords.toLocaleString('en-IN')}</strong>
              <span>project and activity source records</span>
              <small>Records may refer to the same work across agencies.</small>
            </section>
            <button ref={enter} type="button" className={styles.enter} onClick={acknowledge}>
              I understand — explore Hisaab <span aria-hidden="true">→</span>
            </button>
          </section>
        </div>
      )}
    </>
  );
}
