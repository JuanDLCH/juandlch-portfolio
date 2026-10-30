// The CV rendered from src/lab/chat/cv.ts, with the items an answer cites
// highlighted. Shown in the chat's CV dialog when a CV citation is clicked.
import { useEffect, useRef } from 'react';
import { CV, CV_HEAD, type CvItem } from '../../lab/chat/cv';

// Background, not outline: highlighted items wrap over several lines.
const mark = 'bg-accent/20 text-ink box-decoration-clone px-0.5';

export default function CvViewer({
  ids,
  focus,
}: {
  /** Every CV item the answer cites. */
  ids: string[];
  /** Item whose citation was clicked; scrolled into view. */
  focus: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current
      ?.querySelector(`[data-cv="${focus}"]`)
      ?.scrollIntoView({ block: 'center' });
  }, [focus]);

  return (
    <div
      ref={ref}
      className="bg-bg border-line2 text-body border px-6 py-5 text-[13px] leading-[1.55]"
    >
      <h3 className="text-ink m-0 text-lg font-semibold tracking-[-0.02em]">
        {CV_HEAD.name}
      </h3>
      <p className="text-accent m-0 mt-0.5 font-medium">{CV_HEAD.headline}</p>
      <p className="text-muted m-0 mt-1 text-xs">{CV_HEAD.contact}</p>
      <p className="m-0 mt-2 text-xs">
        <Item it={CV_HEAD.stats} ids={ids} />
      </p>
      {CV.map((sec) => (
        <section key={sec.id} className="mt-4">
          <h4 className="border-line2 text-ink m-0 mb-2 border-b pb-1 font-mono text-[11px] tracking-[0.08em] uppercase">
            {sec.title}
          </h4>
          {sec.blocks.map((b, bi) => (
            <div key={bi} className={bi ? 'mt-3' : undefined}>
              {b.heading && (
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-ink font-semibold">{b.heading}</span>
                  <span className="text-muted text-xs">{b.meta}</span>
                </div>
              )}
              {sec.bullets ? (
                <ul className="m-0 mt-1 flex list-disc flex-col gap-1 pl-5">
                  {b.items.map((it) => (
                    <li key={it.id}>
                      <Item it={it} ids={ids} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="flex flex-col gap-1">
                  {b.items.map((it) => (
                    <p key={it.id} className="m-0">
                      <Item it={it} ids={ids} />
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

function Item({ it, ids }: { it: CvItem; ids: string[] }) {
  return (
    <span data-cv={it.id} className={ids.includes(it.id) ? mark : undefined}>
      {it.label && (
        <strong className="text-ink font-semibold">{it.label}: </strong>
      )}
      {it.text}
    </span>
  );
}
