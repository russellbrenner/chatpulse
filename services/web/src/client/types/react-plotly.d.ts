// Type declarations for react-plotly.js
// The package doesn't ship its own types.
declare module 'react-plotly.js' {
  import { Component } from 'react';
  import type { Data, Layout, Config, PlotMouseEvent } from 'plotly.js';

  interface PlotParams {
    data: Data[];
    layout?: Partial<Layout>;
    config?: Partial<Config>;
    style?: React.CSSProperties;
    className?: string;
    useResizeHandler?: boolean;
    onClick?: (event: PlotMouseEvent) => void;
    onHover?: (event: PlotMouseEvent) => void;
  }

  export default class Plot extends Component<PlotParams> {}
}
