<template>
  <div class="data-viewer">
    <a-card title="数据查看器" :bordered="false">
      <!-- 查询条件 -->
      <a-form layout="inline" class="query-form">
        <a-form-item label="时间范围">
          <a-range-picker
            v-model:value="timeRange"
            show-time
            :disabled="loading"
          />
        </a-form-item>
        <a-form-item label="监控点">
          <a-select
            v-model:value="selectedPoints"
            mode="multiple"
            placeholder="选择监控点"
            :options="pointOptions"
            :disabled="loading"
          />
        </a-form-item>
        <a-form-item label="最低质量">
          <a-input-number
            v-model:value="minQuality"
            :min="0"
            :max="100"
            :disabled="loading"
          />
        </a-form-item>
        <a-form-item>
          <a-button
            type="primary"
            :loading="loading"
            @click="handleQuery"
          >
            查询
          </a-button>
        </a-form-item>
        <a-form-item>
          <a-button
            :loading="exporting"
            @click="handleExport"
          >
            导出CSV
          </a-button>
        </a-form-item>
      </a-form>

      <!-- 趋势图 -->
      <div class="chart-container">
        <v-chart
          class="chart"
          :option="chartOption"
          :loading="loading"
          :autoresize="true"
        />
      </div>

      <!-- 数据表格 -->
      <a-table
        :columns="columns"
        :data-source="tableData"
        :loading="loading"
        :pagination="pagination"
        @change="handleTableChange"
        size="small"
        class="data-table"
      >
        <template #quality="{ text }">
          <a-tag :color="getQualityColor(text)">
            {{ text }}
          </a-tag>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, watch } from 'vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
} from 'echarts/components';
import VChart from 'vue-echarts';
import { message } from 'ant-design-vue';
import { ipcRenderer } from 'electron';
import type { Moment } from 'moment';

use([
  CanvasRenderer,
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
]);

interface DataRecord {
  pointId: string;
  value: number;
  quality: number;
  timestamp: string;
}

interface Point {
  id: string;
  name: string;
}

export default defineComponent({
  name: 'DataViewer',
  components: {
    VChart,
  },
  setup() {
    // 状态
    const loading = ref(false);
    const exporting = ref(false);
    const timeRange = ref<[Moment, Moment]>();
    const selectedPoints = ref<string[]>([]);
    const minQuality = ref(0);
    const points = ref<Point[]>([]);
    const records = ref<DataRecord[]>([]);

    // 计算属性
    const pointOptions = computed(() => {
      return points.value.map(point => ({
        value: point.id,
        label: point.name,
      }));
    });

    const chartOption = computed(() => {
      const series = selectedPoints.value.map(pointId => {
        const point = points.value.find(p => p.id === pointId);
        const data = records.value
          .filter(r => r.pointId === pointId)
          .map(r => [r.timestamp, r.value]);

        return {
          name: point?.name || pointId,
          type: 'line',
          data,
          showSymbol: false,
          animation: false,
        };
      });

      return {
        tooltip: {
          trigger: 'axis',
          formatter: (params: any[]) => {
            let result = params[0].axisValue + '<br/>';
            params.forEach(param => {
              const record = records.value.find(
                r => r.timestamp === param.axisValue && r.pointId === param.seriesName
              );
              result += `${param.marker} ${param.seriesName}: ${param.value[1]}`;
              if (record) {
                result += ` (质量: ${record.quality})`;
              }
              result += '<br/>';
            });
            return result;
          },
        },
        legend: {
          data: series.map(s => s.name),
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          containLabel: true,
        },
        xAxis: {
          type: 'time',
          splitLine: {
            show: false,
          },
        },
        yAxis: {
          type: 'value',
          splitLine: {
            lineStyle: {
              type: 'dashed',
            },
          },
        },
        dataZoom: [
          {
            type: 'inside',
            start: 0,
            end: 100,
          },
          {
            start: 0,
            end: 100,
          },
        ],
        series,
      };
    });

    const tableData = computed(() => {
      return records.value.map((record, index) => ({
        key: index,
        timestamp: record.timestamp,
        point: points.value.find(p => p.id === record.pointId)?.name || record.pointId,
        value: record.value,
        quality: record.quality,
      }));
    });

    // 表格列定义
    const columns = [
      {
        title: '时间',
        dataIndex: 'timestamp',
        key: 'timestamp',
        sorter: true,
      },
      {
        title: '监控点',
        dataIndex: 'point',
        key: 'point',
        filters: computed(() => 
          Array.from(new Set(tableData.value.map(d => d.point))).map(point => ({
            text: point,
            value: point,
          }))
        ),
      },
      {
        title: '数值',
        dataIndex: 'value',
        key: 'value',
        sorter: true,
      },
      {
        title: '质量',
        dataIndex: 'quality',
        key: 'quality',
        slots: { customRender: 'quality' },
        sorter: true,
      },
    ];

    // 分页配置
    const pagination = {
      total: computed(() => records.value.length),
      current: ref(1),
      pageSize: ref(10),
      showSizeChanger: true,
      showQuickJumper: true,
    };

    // 方法
    const loadPoints = async () => {
      try {
        const response = await ipcRenderer.invoke('database:getTagConfigs');
        points.value = response;
      } catch (error) {
        message.error('加载监控点失败');
      }
    };

    const handleQuery = async () => {
      if (!timeRange.value) {
        message.warning('请选择时间范围');
        return;
      }

      loading.value = true;
      try {
        const response = await ipcRenderer.invoke('data:query', {
          startTime: timeRange.value[0].toISOString(),
          endTime: timeRange.value[1].toISOString(),
          pointIds: selectedPoints.value,
          minQuality: minQuality.value,
        });
        records.value = response;
      } catch (error) {
        message.error('查询数据失败');
      } finally {
        loading.value = false;
      }
    };

    const handleExport = async () => {
      if (!timeRange.value) {
        message.warning('请选择时间范围');
        return;
      }

      exporting.value = true;
      try {
        const csv = await ipcRenderer.invoke('data:export', {
          startTime: timeRange.value[0].toISOString(),
          endTime: timeRange.value[1].toISOString(),
          pointIds: selectedPoints.value,
          minQuality: minQuality.value,
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `data_${timeRange.value[0].format('YYYYMMDD')}_${timeRange.value[1].format('YYYYMMDD')}.csv`;
        link.click();
      } catch (error) {
        message.error('导出数据失败');
      } finally {
        exporting.value = false;
      }
    };

    const handleTableChange = (pagination: any, filters: any, sorter: any) => {
      // 处理表格排序和过滤
      let result = [...records.value];

      // 过滤
      if (filters.point?.length) {
        result = result.filter(record => 
          filters.point.includes(points.value.find(p => p.id === record.pointId)?.name)
        );
      }

      // 排序
      if (sorter.field) {
        result.sort((a: any, b: any) => {
          const compareA = a[sorter.field];
          const compareB = b[sorter.field];
          
          if (sorter.order === 'descend') {
            return compareB > compareA ? 1 : -1;
          }
          return compareA > compareB ? 1 : -1;
        });
      }

      records.value = result;
    };

    const getQualityColor = (quality: number) => {
      if (quality >= 90) return 'green';
      if (quality >= 60) return 'orange';
      return 'red';
    };

    // 生命周期
    watch(
      () => selectedPoints.value,
      () => {
        if (records.value.length > 0) {
          handleQuery();
        }
      }
    );

    onMounted(() => {
      loadPoints();
    });

    return {
      // 状态
      loading,
      exporting,
      timeRange,
      selectedPoints,
      minQuality,
      points,
      records,

      // 计算属性
      pointOptions,
      chartOption,
      tableData,
      columns,
      pagination,

      // 方法
      handleQuery,
      handleExport,
      handleTableChange,
      getQualityColor,
    };
  },
});
</script>

<style scoped>
.data-viewer {
  padding: 24px;
}

.query-form {
  margin-bottom: 24px;
}

.chart-container {
  margin: 24px 0;
  height: 400px;
}

.chart {
  height: 100%;
}

.data-table {
  margin-top: 24px;
}
</style>
