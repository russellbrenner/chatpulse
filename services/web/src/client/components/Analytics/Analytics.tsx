import Plot from 'react-plotly.js';

/**
 * Analytics dashboard — visualise messaging patterns.
 *
 * Currently a stub with a single empty Plotly chart. Will be expanded
 * to include:
 * - Message volume timeline
 * - Top contacts breakdown
 * - Hourly/daily heatmap
 * - Response time distributions
 * - Reaction analysis
 */
export function Analytics() {
  return (
    <div>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>
        Message Analytics
      </h2>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        Visual breakdowns of your messaging patterns. Charts will populate once
        analysis data is available from the extraction service.
      </p>
      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          padding: '1rem',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        }}
      >
        <Plot
          data={[]}
          layout={{
            title: 'Message Analytics',
            xaxis: { title: 'Date' },
            yaxis: { title: 'Messages' },
            height: 400,
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { family: '-apple-system, BlinkMacSystemFont, sans-serif' },
          }}
          config={{ responsive: true }}
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
}
