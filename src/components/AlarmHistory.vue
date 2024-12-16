<template>
  <div class="alarm-history">
    <a-card title="报警历史" :bordered="false">
      <!-- 查询条件 -->
      <a-form layout="inline" class="query-form">
        <a-form-item label="时间范围">
          <a-range-picker
            v-model:value="timeRange"
            show-time
            :disabled="loading"
          />
        </a-form-item>
        <a-form-item label="优先级">
          <a-select
            v-model:value="selectedPriorities"
            mode="multiple"
            placeholder="选择优先级"
            :options="priorityOptions"
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
            导出报表
          </a-button>
        </a-form-item>
      </a-form>

      <!-- 统计卡片 -->
      <a-row :gutter="16" class="statistics">
        <a-col :span="6">
          <a-card>
            <a-statistic
              title="总报警次数"
              :value="statistics.total"
              :loading="loading"
            />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card>
            <a-statistic
              title="高优先级"
              :value="statistics.highPriority"
              :valueStyle="{ color: '#cf1322' }"
              :loading="loading"
            />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card>
            <a-statistic
              title="中优先级"
              :value="statistics.mediumPriority"
              :valueStyle="{ color: '#faad14' }"
              :loading="loading"
            />
          </a-card>
        </a-col>
        <a-col :span="6">
          <a-card>
            <a-statistic
              title="低优先级"
              :value="statistics.lowPriority"
              :valueStyle="{ color: '#52c41a' }"
              :loading="loading"
            />
          </a-card>
        </a-col>
      </a-row>

      <!-- 趋势图 -->
      <div class="chart-container">
        <v-chart
          class="chart"
          :option="chartOption"
          :loading="loading"
          :autoresize="true"
        />
      </div>

      <!-- 报警列表 -->
      <a-table
        :columns="columns"
        :data-source="tableData"
        :loading="loading"
        :pagination="pagination"
        @change="handleTableChange"
        size="small"
        class="alarm-table"
      >
        <template #priority="{ text }">
          <a-tag :color="getPriorityColor(text)">
            {{ getPriorityText(text) }}
          </a-tag>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, watch, onMounted } from 'vue';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { LineChart, BarChart } from 'echarts/charts';
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
import moment from 'moment';

use([
  CanvasRenderer,
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
]);

interface AlarmRecord {
  id: string;
  pointId: string;
  timestamp: string;
  value: number;
  threshold: number;
  condition: string;
  priority: number;
  description: string;
}

interface Point {
  id: string;
  name: string;
}

interface Statistics {
  total: number;
  highPriority: number;
  mediumPriority: number;
  lowPriority: number;
}

export default defineComponent({
  name: 'AlarmHistory',
  components: {
    VChart,
  },
  setup() {
    // 状态
    const loading = ref(false);
    const exporting = ref(false);
    const timeRange = ref<[Moment, Moment]>();
    const selectedPriorities = ref<number[]>([]);
    const selectedPoints = ref<string[]>([]);
    const points = ref<Point[]>([]);
    const alarms = ref<AlarmRecord[]>([]);

    // 常量
    const priorityOptions = [
      { value: 1, label: '低优先级' },
      { value: 2, label: '中优先级' },
      { value: 3, label: '高优先级' },
    ];

    // 计算属性
    const pointOptions = computed(() => {
      return points.value.map(point => ({
        value: point.id,
        label: point.name,
      }));
    });

    const statistics = computed<Statistics>(() => {
      const filtered = alarms.value;
      return {
        total: filtered.length,
        highPriority: filtered.filter(a => a.priority === 3).length,
        mediumPriority: filtered.filter(a => a.priority === 2).length,
        lowPriority: filtered.filter(a => a.priority === 1).length,
      };
    });

    const chartOption = computed(() => {
      // 按小时统计报警次数
      const hourlyStats = new Map<string, number[]>();
      const now = moment();
      for (let i = 0; i < 24; i++) {
        const hour = now.clone().subtract(i, 'hours').format('YYYY-MM-DD HH:00');
        hourlyStats.set(hour, [0, 0, 0]); // [低, 中, 高]
      }

      alarms.value.forEach(alarm => {
        const hour = moment(alarm.timestamp).format('YYYY-MM-DD HH:00');
        if (hourlyStats.has(hour)) {
          const stats = hourlyStats.get(hour)!;
          stats[alarm.priority - 1]++;
        }
      });

      const hours = Array.from(hourlyStats.keys()).sort();
      const data = Array.from(hourlyStats.values());

      return {
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            type: 'shadow'
          }
        },
        legend: {
          data: ['低优先级', '中优先级', '高优先级']
        },
        grid: {
          left: '3%',
          right: '4%',
          bottom: '3%',
          containLabel: true
        },
        xAxis: {
          type: 'category',
          data: hours,
          axisLabel: {
            rotate: 45
          }
        },
        yAxis: {
          type: 'value'
        },
        series: [
          {
            name: '低优先级',
            type: 'bar',
            stack: 'total',
            data: data.map(d => d[0]),
            itemStyle: { color: '#52c41a' }
          },
          {
            name: '中优先级',
            type: 'bar',
            stack: 'total',
            data: data.map(d => d[1]),
            itemStyle: { color: '#faad14' }
          },
          {
            name: '高优先级',
            type: 'bar',
            stack: 'total',
            data: data.map(d => d[2]),
            itemStyle: { color: '#cf1322' }
          }
        ]
      };
    });

    const tableData = computed(() => {
      return alarms.value.map((alarm, index) => ({
        key: index,
        timestamp: alarm.timestamp,
        point: points.value.find(p => p.id === alarm.pointId)?.name || alarm.pointId,
        value: alarm.value,
        threshold: alarm.threshold,
        condition: alarm.condition,
        priority: alarm.priority,
        description: alarm.description,
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
        title: '阈值',
        dataIndex: 'threshold',
        key: 'threshold',
      },
      {
        title: '条件',
        dataIndex: 'condition',
        key: 'condition',
      },
      {
        title: '优先级',
        dataIndex: 'priority',
        key: 'priority',
        slots: { customRender: 'priority' },
        filters: priorityOptions,
        sorter: true,
      },
      {
        title: '描述',
        dataIndex: 'description',
        key: 'description',
      },
    ];

    // 分页配置
    const pagination = {
      total: computed(() => alarms.value.length),
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
        const response = await ipcRenderer.invoke('alarm:query', {
          startTime: timeRange.value[0].toISOString(),
          endTime: timeRange.value[1].toISOString(),
          priorities: selectedPriorities.value,
          pointIds: selectedPoints.value,
        });
        alarms.value = response;
      } catch (error) {
        message.error('查询报警记录失败');
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
        const report = await ipcRenderer.invoke('alarm:exportReport', {
          startTime: timeRange.value[0].toISOString(),
          endTime: timeRange.value[1].toISOString(),
          priorities: selectedPriorities.value,
          pointIds: selectedPoints.value,
        });

        const blob = new Blob([report], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `alarm_report_${timeRange.value[0].format('YYYYMMDD')}_${timeRange.value[1].format('YYYYMMDD')}.xlsx`;
        link.click();
      } catch (error) {
        message.error('导出报表失败');
      } finally {
        exporting.value = false;
      }
    };

    const handleTableChange = (pagination: any, filters: any, sorter: any) => {
      // 处理表格排序和过滤
      let result = [...alarms.value];

      // 过滤
      if (filters.point?.length) {
        result = result.filter(alarm => 
          filters.point.includes(points.value.find(p => p.id === alarm.pointId)?.name)
        );
      }
      if (filters.priority?.length) {
        result = result.filter(alarm => 
          filters.priority.includes(alarm.priority)
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

      alarms.value = result;
    };

    const getPriorityColor = (priority: number) => {
      switch (priority) {
        case 3: return 'red';
        case 2: return 'orange';
        case 1: return 'green';
        default: return 'default';
      }
    };

    const getPriorityText = (priority: number) => {
      switch (priority) {
        case 3: return '高';
        case 2: return '中';
        case 1: return '低';
        default: return '未知';
      }
    };

    // 生命周期
    watch(
      () => [selectedPriorities.value, selectedPoints.value],
      () => {
        if (alarms.value.length > 0) {
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
      selectedPriorities,
      selectedPoints,
      points,
      alarms,

      // 常量
      priorityOptions,

      // 计算属性
      pointOptions,
      statistics,
      chartOption,
      tableData,
      columns,
      pagination,

      // 方法
      handleQuery,
      handleExport,
      handleTableChange,
      getPriorityColor,
      getPriorityText,
    };
  },
});
</script>

<style scoped>
.alarm-history {
  padding: 24px;
}

.query-form {
  margin-bottom: 24px;
}

.statistics {
  margin-bottom: 24px;
}

.chart-container {
  margin: 24px 0;
  height: 400px;
}

.chart {
  height: 100%;
}

.alarm-table {
  margin-top: 24px;
}
</style>
