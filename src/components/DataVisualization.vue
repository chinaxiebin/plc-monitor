`<template>
  <div class="data-visualization">
    <div class="toolbar">
      <el-select v-model="selectedPoints" multiple placeholder="选择监控点位" @change="updateCharts">
        <el-option
          v-for="point in monitorPoints"
          :key="point.id"
          :label="point.name"
          :value="point.id"
        />
      </el-select>
      <el-date-picker
        v-model="timeRange"
        type="datetimerange"
        range-separator="至"
        start-placeholder="开始时间"
        end-placeholder="结束时间"
        :shortcuts="dateShortcuts"
        @change="updateCharts"
      />
      <el-select v-model="aggregation" placeholder="数据聚合" @change="updateCharts">
        <el-option label="原始数据" value="raw" />
        <el-option label="平均值" value="avg" />
        <el-option label="最大值" value="max" />
        <el-option label="最小值" value="min" />
      </el-select>
      <el-button-group>
        <el-button type="primary" @click="exportData('csv')">导出CSV</el-button>
        <el-button type="primary" @click="exportData('json')">导出JSON</el-button>
      </el-button-group>
    </div>

    <div class="charts-container">
      <div class="trend-chart">
        <div ref="trendChart" style="width: 100%; height: 400px"></div>
      </div>
      <div class="data-grid">
        <el-table :data="tableData" height="300" border>
          <el-table-column prop="timestamp" label="时间" width="180">
            <template #default="scope">
              {{ formatTime(scope.row.timestamp) }}
            </template>
          </el-table-column>
          <el-table-column
            v-for="point in selectedPointsInfo"
            :key="point.id"
            :prop="'value_' + point.id"
            :label="point.name"
          >
            <template #default="scope">
              {{ formatValue(scope.row['value_' + point.id], point) }}
            </template>
          </el-table-column>
          <el-table-column prop="quality" label="质量戳" width="100" />
        </el-table>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import * as echarts from 'echarts';
import dayjs from 'dayjs';
import { ipcRenderer } from 'electron';

interface MonitorPoint {
  id: number;
  name: string;
  type: string;
  unit: string;
  scale: number;
}

interface DataPoint {
  pointId: number;
  value: number;
  quality: number;
  timestamp: string;
}

export default defineComponent({
  name: 'DataVisualization',

  setup() {
    const selectedPoints = ref<number[]>([]);
    const monitorPoints = ref<MonitorPoint[]>([]);
    const timeRange = ref<[Date, Date]>([
      dayjs().subtract(1, 'hour').toDate(),
      dayjs().toDate()
    ]);
    const aggregation = ref('raw');
    const tableData = ref<any[]>([]);
    const trendChart = ref<echarts.ECharts>();
    const selectedPointsInfo = ref<MonitorPoint[]>([]);

    const dateShortcuts = [
      {
        text: '最近1小时',
        value: () => {
          const end = new Date();
          const start = new Date();
          start.setTime(start.getTime() - 3600 * 1000);
          return [start, end];
        },
      },
      {
        text: '最近24小时',
        value: () => {
          const end = new Date();
          const start = new Date();
          start.setTime(start.getTime() - 3600 * 1000 * 24);
          return [start, end];
        },
      },
      {
        text: '最近7天',
        value: () => {
          const end = new Date();
          const start = new Date();
          start.setTime(start.getTime() - 3600 * 1000 * 24 * 7);
          return [start, end];
        },
      },
    ];

    // 初始化图表
    const initChart = () => {
      const chartDom = document.querySelector('.trend-chart div');
      if (chartDom) {
        trendChart.value = echarts.init(chartDom);
      }
    };

    // 更新图表数据
    const updateCharts = async () => {
      if (!selectedPoints.value.length || !timeRange.value[0] || !timeRange.value[1]) {
        return;
      }

      try {
        const response = await ipcRenderer.invoke('query-data', {
          pointIds: selectedPoints.value,
          startTime: timeRange.value[0].toISOString(),
          endTime: timeRange.value[1].toISOString(),
          aggregation: aggregation.value
        });

        updateTrendChart(response);
        updateDataTable(response);
      } catch (error) {
        ElMessage.error('获取数据失败：' + error.message);
      }
    };

    // 更新趋势图
    const updateTrendChart = (data: DataPoint[]) => {
      if (!trendChart.value) return;

      const series = selectedPointsInfo.value.map(point => ({
        name: point.name,
        type: 'line',
        data: data
          .filter(d => d.pointId === point.id)
          .map(d => [d.timestamp, d.value * point.scale])
      }));

      const option = {
        title: {
          text: '数据趋势图'
        },
        tooltip: {
          trigger: 'axis',
          formatter: (params: any) => {
            let result = dayjs(params[0].axisValue).format('YYYY-MM-DD HH:mm:ss') + '<br/>';
            params.forEach((param: any) => {
              const point = selectedPointsInfo.value.find(p => p.name === param.seriesName);
              result += `${param.seriesName}: ${param.value[1].toFixed(2)}${point?.unit || ''}<br/>`;
            });
            return result;
          }
        },
        xAxis: {
          type: 'time',
          axisLabel: {
            formatter: (value: number) => dayjs(value).format('HH:mm:ss')
          }
        },
        yAxis: {
          type: 'value'
        },
        legend: {
          data: selectedPointsInfo.value.map(p => p.name)
        },
        dataZoom: [
          {
            type: 'slider',
            show: true,
            xAxisIndex: [0],
            start: 0,
            end: 100
          },
          {
            type: 'inside',
            xAxisIndex: [0],
            start: 0,
            end: 100
          }
        ],
        series
      };

      trendChart.value.setOption(option);
    };

    // 更新数据表格
    const updateDataTable = (data: DataPoint[]) => {
      const tableRows: { [key: string]: any }[] = [];
      const timeGroups = new Map<string, DataPoint[]>();

      // 按时间分组数据
      data.forEach(point => {
        const time = point.timestamp;
        if (!timeGroups.has(time)) {
          timeGroups.set(time, []);
        }
        timeGroups.get(time)?.push(point);
      });

      // 构建表格数据
      timeGroups.forEach((points, time) => {
        const row: { [key: string]: any } = {
          timestamp: time,
          quality: points[0]?.quality || 0
        };

        points.forEach(point => {
          const pointInfo = selectedPointsInfo.value.find(p => p.id === point.pointId);
          if (pointInfo) {
            row['value_' + point.pointId] = point.value * (pointInfo.scale || 1);
          }
        });

        tableRows.push(row);
      });

      tableData.value = tableRows.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
    };

    // 导出数据
    const exportData = async (format: 'csv' | 'json') => {
      if (!selectedPoints.value.length || !timeRange.value[0] || !timeRange.value[1]) {
        ElMessage.warning('请先选择监控点位和时间范围');
        return;
      }

      try {
        const response = await ipcRenderer.invoke('export-data', {
          pointIds: selectedPoints.value,
          startTime: timeRange.value[0].toISOString(),
          endTime: timeRange.value[1].toISOString(),
          format
        });

        const blob = new Blob([response], { 
          type: format === 'csv' ? 'text/csv' : 'application/json' 
        });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `data_export_${dayjs().format('YYYYMMDD_HHmmss')}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        ElMessage.success('数据导出成功');
      } catch (error) {
        ElMessage.error('数据导出失败：' + error.message);
      }
    };

    // 格式化时间
    const formatTime = (time: string) => {
      return dayjs(time).format('YYYY-MM-DD HH:mm:ss');
    };

    // 格式化数值
    const formatValue = (value: number, point: MonitorPoint) => {
      if (value === undefined || value === null) return '-';
      return `${value.toFixed(2)}${point.unit || ''}`;
    };

    // 监听窗口大小变化
    const handleResize = () => {
      trendChart.value?.resize();
    };

    onMounted(async () => {
      window.addEventListener('resize', handleResize);
      initChart();

      try {
        // 获取监控点位列表
        const points = await ipcRenderer.invoke('get-monitor-points');
        monitorPoints.value = points;
      } catch (error) {
        ElMessage.error('获取监控点位失败：' + error.message);
      }
    });

    // 监听选中点位变化
    watch(selectedPoints, async (newVal) => {
      selectedPointsInfo.value = monitorPoints.value.filter(p => newVal.includes(p.id));
    });

    return {
      selectedPoints,
      monitorPoints,
      timeRange,
      aggregation,
      dateShortcuts,
      tableData,
      selectedPointsInfo,
      updateCharts,
      exportData,
      formatTime,
      formatValue
    };
  }
});
</script>

<style scoped>
.data-visualization {
  padding: 20px;
}

.toolbar {
  margin-bottom: 20px;
  display: flex;
  gap: 10px;
  align-items: center;
}

.charts-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.trend-chart {
  background: #fff;
  padding: 20px;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0,0,0,0.1);
}

.data-grid {
  background: #fff;
  padding: 20px;
  border-radius: 4px;
  box-shadow: 0 2px 12px 0 rgba(0,0,0,0.1);
}
</style>`
