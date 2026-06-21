import { useEffect, useState } from 'react';

import { Link } from 'react-router-dom';

import { useAnimatedStat } from '../../hooks/useAnimatedStat';

import { useInView } from '../../hooks/useInView';



const RADIUS = 54;

const CIRCUMFERENCE = 2 * Math.PI * RADIUS;



export default function StudentLatestResultCard({ result }) {

  const [ref, inView] = useInView({ threshold: 0.25 });

  const score = result?.resultAvailable !== false ? Number(result?.score ?? 0) : 0;

  const maxScore = Number(result?.maxScore ?? 10) || 10;

  const ratio = maxScore > 0 ? Math.min(1, score / maxScore) : 0;

  const percentage = result?.percentage ?? Math.round(ratio * 100);



  const { value: displayScore } = useAnimatedStat(score, {

    enabled: inView && Boolean(result),

  });

  const { value: displayPct } = useAnimatedStat(percentage, {

    enabled: inView && Boolean(result),

  });



  const dashOffset = CIRCUMFERENCE * (1 - ratio);

  const [ringDrawn, setRingDrawn] = useState(false);



  useEffect(() => {

    if (!inView || !result) {

      setRingDrawn(false);

      return undefined;

    }

    const frame = requestAnimationFrame(() => setRingDrawn(true));

    return () => cancelAnimationFrame(frame);

  }, [inView, result, score, maxScore]);



  return (

    <article ref={ref} className={`sp-panel sp-card sp-card--interactive sp-animate-in sp-animate-in--3${result ? '' : ' sp-panel--empty'}`}>

      <p className="sp-label">Latest result</p>

      <h2 className="sp-panel__title">Recent performance</h2>



      {result ? (

        <>

          <div className="sp-result-ring">

            <svg className="sp-result-ring__svg" viewBox="0 0 140 140" aria-hidden>

              <circle className="sp-result-ring__bg" cx="70" cy="70" r={RADIUS} fill="none" strokeWidth="10" />

              <circle

                className="sp-result-ring__fill"

                cx="70"

                cy="70"

                r={RADIUS}

                fill="none"

                strokeWidth="10"

                strokeDasharray={CIRCUMFERENCE}

                strokeDashoffset={ringDrawn ? dashOffset : CIRCUMFERENCE}

                strokeLinecap="round"

                transform="rotate(-90 70 70)"

              />

            </svg>

            <div className="sp-result-ring__label">

              <span className="sp-result-ring__score">

                {displayScore}/{maxScore}

              </span>

              <span className="sp-body">{displayPct}%</span>

            </div>

          </div>

          <p className="sp-panel__headline sp-text-center">{result.testTitle}</p>

          {result.resultAvailable !== false ? (

            <Link

              className="sp-link sp-text-center sp-block"

              to={`/dashboard/tests/${result.testId || 'test'}/results/${result.attemptId}`}

            >

              View detail

            </Link>

          ) : (

            <p className="sp-body sp-text-center">Results not released yet</p>

          )}

        </>

      ) : (

        <p className="sp-body">No attempts yet. Take your first test to see results here.</p>

      )}

    </article>

  );

}

