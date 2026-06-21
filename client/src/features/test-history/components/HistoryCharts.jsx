import HistoryDistributionChart from './HistoryDistributionChart';
import HistoryScoreChart from './HistoryScoreChart';

/**
 * Side-by-side charts for desktop; stacked on mobile.
 * @param {{ items: Array<Record<string, unknown>>, statistics?: Record<string, unknown> }} props
 */
export default function HistoryCharts({ items, statistics }) {
  return (
    <section className="th-charts" aria-label="Results charts">
      <HistoryScoreChart
        items={items}
        averagePercentage={statistics?.averagePercentage ?? null}
      />
      <HistoryDistributionChart statistics={statistics} items={items} />
    </section>
  );
}
