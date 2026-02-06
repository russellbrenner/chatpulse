import { useEffect, useState, useCallback } from 'react';
import Plot from 'react-plotly.js';
import { fetchAnalysis } from '../../lib/api';

// ---------------------------------------------------------------------------
// TypeScript interfaces matching the extraction service Pydantic models
// ---------------------------------------------------------------------------

interface ContactMessageCount {
  handle_id: number;
  handle: string;
  total: number;
  sent: number;
  received: number;
}

interface TimelineBucket {
  period: string;
  count: number;
}

interface TopContact {
  handle_id: number;
  handle: string;
  message_count: number;
}

interface ResponseTime {
  handle_id: number;
  handle: string;
  avg_response_seconds: number | null;
}

interface HourBucket {
  hour: number;
  count: number;
}

interface ReactionCount {
  reaction_type: number;
  label: string;
  count: number;
}

// ---------------------------------------------------------------------------
// Per-chart loading state
// ---------------------------------------------------------------------------

interface ChartState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function initialChartState<T>(): ChartState<T> {
  return { data: null, loading: false, error: null };
}

// ---------------------------------------------------------------------------
// Shared Plotly defaults
// ---------------------------------------------------------------------------

const FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const BASE_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: 'transparent',
  font: { family: FONT_FAMILY, size: 12, color: '#333' },
  margin: { l: 60, r: 24, t: 48, b: 56 },
  autosize: true,
};

const PLOTLY_CONFIG: Partial<Plotly.Config> = {
  responsive: true,
  displayModeBar: false,
};

const COLOURS = {
  primary: '#1a1a2e',
  sent: '#4a6cf7',
  received: '#f7844a',
  accent: '#6c63ff',
  heatmapLow: '#f5f5f5',
  heatmapHigh: '#1a1a2e',
};

// ---------------------------------------------------------------------------
// Timeline interval options
// ---------------------------------------------------------------------------

type Interval = 'day' | 'week' | 'month';

const INTERVAL_OPTIONS: { value: Interval; label: string }[] = [
  { value: 'day', label: 'Daily' },
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function Analytics() {
  const [dbPath, setDbPath] = useState('');
  const [submittedPath, setSubmittedPath] = useState('');
  const [interval, setInterval] = useState<Interval>('day');

  const [messageCounts, setMessageCounts] = useState<ChartState<ContactMessageCount[]>>(initialChartState);
  const [timeline, setTimeline] = useState<ChartState<TimelineBucket[]>>(initialChartState);
  const [topContacts, setTopContacts] = useState<ChartState<TopContact[]>>(initialChartState);
  const [responseTimes, setResponseTimes] = useState<ChartState<ResponseTime[]>>(initialChartState);
  const [heatmap, setHeatmap] = useState<ChartState<HourBucket[]>>(initialChartState);
  const [reactions, setReactions] = useState<ChartState<ReactionCount[]>>(initialChartState);

  // Generic fetcher that manages loading / error state for a single chart.
  const fetchChart = useCallback(
    async <T,>(
      endpoint: string,
      setter: React.Dispatch<React.SetStateAction<ChartState<T>>>,
      params?: Record<string, string | number | undefined>,
    ) => {
      setter({ data: null, loading: true, error: null });
      try {
        const data = await fetchAnalysis<T>(endpoint, { db_path: submittedPath, ...params });
        setter({ data, loading: false, error: null });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setter({ data: null, loading: false, error: msg });
      }
    },
    [submittedPath],
  );

  // Fetch all charts (except timeline, which depends on interval).
  useEffect(() => {
    if (!submittedPath) return;
    fetchChart<ContactMessageCount[]>('message-counts', setMessageCounts);
    fetchChart<TopContact[]>('top-contacts', setTopContacts, { limit: 20 });
    fetchChart<ResponseTime[]>('response-times', setResponseTimes);
    fetchChart<HourBucket[]>('heatmap', setHeatmap);
    fetchChart<ReactionCount[]>('reactions', setReactions);
  }, [submittedPath, fetchChart]);

  // Timeline refetches when interval changes.
  useEffect(() => {
    if (!submittedPath) return;
    fetchChart<TimelineBucket[]>('timeline', setTimeline, { interval });
  }, [submittedPath, interval, fetchChart]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dbPath.trim()) {
      setSubmittedPath(dbPath.trim());
    }
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div style={containerStyle}>
      <h2 style={headingStyle}>Message Analytics</h2>
      <p style={subheadingStyle}>
        Visual breakdowns of your messaging patterns. Enter the path to a chat.db
        file to populate the charts.
      </p>

      {/* Database path input */}
      <form onSubmit={handleSubmit} style={formStyle}>
        <input
          type="text"
          value={dbPath}
          onChange={(e) => setDbPath(e.target.value)}
          placeholder="~/Library/Messages/chat.db"
          style={inputStyle}
        />
        <button type="submit" style={buttonStyle}>
          Analyse
        </button>
      </form>

      {!submittedPath ? (
        <div style={placeholderStyle}>
          <p style={{ color: '#888', fontSize: '1rem' }}>
            Enter a database path above to begin analysis.
          </p>
        </div>
      ) : (
        <>
          {/* Timeline interval selector */}
          <div style={intervalBarStyle}>
            <span style={{ fontSize: '0.85rem', color: '#555' }}>Timeline interval:</span>
            {INTERVAL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setInterval(opt.value)}
                style={interval === opt.value ? intervalActiveStyle : intervalBtnStyle}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 2-column chart grid */}
          <div style={gridStyle}>
            <ChartCard title="Message Counts by Contact" state={messageCounts}>
              {messageCounts.data && <MessageCountsChart data={messageCounts.data} />}
            </ChartCard>

            <ChartCard title="Messages Over Time" state={timeline}>
              {timeline.data && <TimelineChart data={timeline.data} />}
            </ChartCard>

            <ChartCard title="Top Contacts" state={topContacts}>
              {topContacts.data && <TopContactsChart data={topContacts.data} />}
            </ChartCard>

            <ChartCard title="Average Response Times" state={responseTimes}>
              {responseTimes.data && <ResponseTimesChart data={responseTimes.data} />}
            </ChartCard>

            <ChartCard title="Messages by Hour of Day" state={heatmap}>
              {heatmap.data && <HeatmapChart data={heatmap.data} />}
            </ChartCard>

            <ChartCard title="Reaction Breakdown" state={reactions}>
              {reactions.data && <ReactionsChart data={reactions.data} />}
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChartCard wrapper — handles loading / error / empty states
// ---------------------------------------------------------------------------

function ChartCard<T>({
  title,
  state,
  children,
}: {
  title: string;
  state: ChartState<T>;
  children: React.ReactNode;
}) {
  return (
    <div style={cardStyle}>
      <h3 style={cardTitleStyle}>{title}</h3>
      {state.loading && <LoadingSpinner />}
      {state.error && <ErrorMessage message={state.error} />}
      {!state.loading && !state.error && state.data !== null && children}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div style={centeredStyle}>
      <div style={spinnerStyle} />
      <p style={{ color: '#888', marginTop: '0.75rem', fontSize: '0.875rem' }}>
        Loading data…
      </p>
    </div>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <div style={centeredStyle}>
      <p style={{ color: '#c0392b', fontSize: '0.875rem' }}>
        Failed to load: {message}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Individual chart components
// ---------------------------------------------------------------------------

function MessageCountsChart({ data }: { data: ContactMessageCount[] }) {
  // Show top 15 contacts by total volume for readability.
  const top = data.slice(0, 15);
  const handles = top.map((d) => d.handle);

  return (
    <Plot
      data={[
        {
          type: 'bar',
          name: 'Sent',
          x: handles,
          y: top.map((d) => d.sent),
          marker: { color: COLOURS.sent },
        },
        {
          type: 'bar',
          name: 'Received',
          x: handles,
          y: top.map((d) => d.received),
          marker: { color: COLOURS.received },
        },
      ]}
      layout={{
        ...BASE_LAYOUT,
        barmode: 'stack',
        xaxis: { tickangle: -45, automargin: true },
        yaxis: { title: 'Messages' },
        legend: { orientation: 'h', y: 1.12 },
        height: 380,
      }}
      config={PLOTLY_CONFIG}
      style={plotStyle}
    />
  );
}

function TimelineChart({ data }: { data: TimelineBucket[] }) {
  return (
    <Plot
      data={[
        {
          type: 'scatter',
          mode: 'lines',
          x: data.map((d) => d.period),
          y: data.map((d) => d.count),
          line: { color: COLOURS.accent, width: 1.5 },
          fill: 'tozeroy',
          fillcolor: 'rgba(108, 99, 255, 0.1)',
        },
      ]}
      layout={{
        ...BASE_LAYOUT,
        xaxis: { title: 'Period', automargin: true },
        yaxis: { title: 'Messages' },
        height: 380,
      }}
      config={PLOTLY_CONFIG}
      style={plotStyle}
    />
  );
}

function TopContactsChart({ data }: { data: TopContact[] }) {
  // Horizontal bar — reverse so the highest is at the top.
  const sorted = [...data].reverse();

  return (
    <Plot
      data={[
        {
          type: 'bar',
          orientation: 'h',
          y: sorted.map((d) => d.handle),
          x: sorted.map((d) => d.message_count),
          marker: { color: COLOURS.primary },
        },
      ]}
      layout={{
        ...BASE_LAYOUT,
        xaxis: { title: 'Messages' },
        yaxis: { automargin: true, dtick: 1 },
        height: 380,
        margin: { ...BASE_LAYOUT.margin, l: 140 },
      }}
      config={PLOTLY_CONFIG}
      style={plotStyle}
    />
  );
}

function ResponseTimesChart({ data }: { data: ResponseTime[] }) {
  // Show top 15 contacts with the fastest response times.
  const valid = data.filter((d) => d.avg_response_seconds != null).slice(0, 15);
  const handles = valid.map((d) => d.handle);
  const minutes = valid.map((d) => (d.avg_response_seconds ?? 0) / 60);

  return (
    <Plot
      data={[
        {
          type: 'bar',
          x: handles,
          y: minutes,
          marker: { color: COLOURS.sent },
        },
      ]}
      layout={{
        ...BASE_LAYOUT,
        xaxis: { tickangle: -45, automargin: true },
        yaxis: { title: 'Avg Response (minutes)' },
        height: 380,
      }}
      config={PLOTLY_CONFIG}
      style={plotStyle}
    />
  );
}

function HeatmapChart({ data }: { data: HourBucket[] }) {
  // Build a full 0-23 hour array (some hours may be missing from the data).
  const countByHour = new Array<number>(24).fill(0);
  for (const d of data) {
    countByHour[d.hour] = d.count;
  }

  const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

  return (
    <Plot
      data={[
        {
          type: 'bar',
          x: hours,
          y: countByHour,
          marker: {
            color: countByHour,
            colorscale: [
              [0, COLOURS.heatmapLow],
              [1, COLOURS.heatmapHigh],
            ],
          },
        },
      ]}
      layout={{
        ...BASE_LAYOUT,
        xaxis: { title: 'Hour of Day', dtick: 2 },
        yaxis: { title: 'Messages' },
        height: 380,
      }}
      config={PLOTLY_CONFIG}
      style={plotStyle}
    />
  );
}

function ReactionsChart({ data }: { data: ReactionCount[] }) {
  const reactionColours: Record<string, string> = {
    Loved: '#e74c3c',
    Liked: '#3498db',
    Disliked: '#95a5a6',
    Laughed: '#f1c40f',
    Emphasised: '#e67e22',
    Questioned: '#9b59b6',
  };

  return (
    <Plot
      data={[
        {
          type: 'bar',
          x: data.map((d) => d.label),
          y: data.map((d) => d.count),
          marker: {
            color: data.map((d) => reactionColours[d.label] ?? '#888'),
          },
        },
      ]}
      layout={{
        ...BASE_LAYOUT,
        xaxis: { automargin: true },
        yaxis: { title: 'Count' },
        height: 380,
      }}
      config={PLOTLY_CONFIG}
      style={plotStyle}
    />
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const containerStyle: React.CSSProperties = {
  maxWidth: '100%',
};

const headingStyle: React.CSSProperties = {
  fontSize: '1.25rem',
  marginBottom: '0.5rem',
  fontWeight: 700,
};

const subheadingStyle: React.CSSProperties = {
  color: '#666',
  marginBottom: '1.25rem',
  fontSize: '0.9rem',
};

const formStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  marginBottom: '1.5rem',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '0.5rem 0.75rem',
  border: '1px solid #ddd',
  borderRadius: '6px',
  fontSize: '0.875rem',
  fontFamily: FONT_FAMILY,
  outline: 'none',
};

const buttonStyle: React.CSSProperties = {
  background: '#1a1a2e',
  color: '#fff',
  border: 'none',
  borderRadius: '6px',
  padding: '0.5rem 1.25rem',
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const placeholderStyle: React.CSSProperties = {
  textAlign: 'center',
  padding: '4rem 1rem',
};

const intervalBarStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  marginBottom: '1rem',
};

const intervalBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid #ddd',
  borderRadius: '4px',
  padding: '0.25rem 0.75rem',
  fontSize: '0.8rem',
  cursor: 'pointer',
  color: '#555',
};

const intervalActiveStyle: React.CSSProperties = {
  ...intervalBtnStyle,
  background: '#1a1a2e',
  borderColor: '#1a1a2e',
  color: '#fff',
};

const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '1.25rem',
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: '8px',
  padding: '1rem',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  minHeight: '420px',
  display: 'flex',
  flexDirection: 'column',
};

const cardTitleStyle: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 600,
  marginBottom: '0.5rem',
  color: '#1a1a2e',
};

const centeredStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
};

const spinnerStyle: React.CSSProperties = {
  width: '28px',
  height: '28px',
  border: '3px solid #eee',
  borderTopColor: '#1a1a2e',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite',
};

const plotStyle: React.CSSProperties = {
  width: '100%',
};
