import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  AriaComponent,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  MarkPointComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

let installed = false

export function installEChartsEngine() {
  if (installed && window.echarts) return
  echarts.use([
    LineChart,
    AriaComponent,
    DataZoomComponent,
    GridComponent,
    LegendComponent,
    MarkAreaComponent,
    MarkLineComponent,
    MarkPointComponent,
    TooltipComponent,
    CanvasRenderer,
  ])
  window.echarts = echarts
  installed = true
}
