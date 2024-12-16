`<template>
  <div class="system-monitor">
    <el-row :gutter="20">
      <!-- 系统状态卡片 -->
      <el-col :span="8" v-for="metric in systemMetrics" :key="metric.type">
        <el-card class="metric-card" :body-style="{ padding: '20px' }">
          <template #header>
            <div class="card-header">
              <span>{{ metric.label }}</span>
              <el-tag :type="getStatusType(metric.value, metric.threshold)">
                {{ getStatusText(metric.value, metric.threshold) }}
              </el-tag>
            </div>
          </template>
          <div class="metric-value">
            <el-progress
              type="dashboard"
              :percentage="metric.percentage"
              :color="getDashboardColor(metric.percentage)"
            >
              <template #default="{ percentage }">
                <span class="progress-value">{{ formatValue(metric.value, metric.unit) }}</span>
                <span class="progress-label">{{ percentage.toFixed(1) }}%</span>
              </template>
            </el-progress>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 系统状态趋势图 -->
    <el-card class="trend-card">
      <template #header>
        <div class="card-header">
          <span>系统状态趋势</span>
          <el-radio-group v-model="selectedMetric" size="small">
            <el-radio-button label="cpu">CPU</el-radio-button>
            <el-radio-button label="memory">内存</el-radio-button>
            <el-radio-button label="disk">磁盘</el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <div ref="trendChart" style="width: 100%; height: 300px"></div>
    </el-card>

    <!-- 系统日志 -->
    <el-card class="log-card">
      <template #header>
        <div class="card-header">
          <span>系统日志</span>
          <div class="header-controls">
            <el-select v-model="logLevel" placeholder="日志级别" size="small">
              <el-option label="全部" value="" />
              <el-option label="信息" value="info" />
              <el-option label="警告" value="warning" />
              <el-option label="错误" value="error" />
            </el-select>
            <el-button size="small" @click="refreshLogs">刷新</el-button>
          </div>
        </div>
      </template>
      <el-table :data="logs" height="400" border>
        <el-table-column prop="timestamp" label="时间" width="180">
          <template #default="scope">
            {{ formatTime(scope.row.timestamp) }}
          </template>
        </el-table-column>
        <el-table-column prop="level" label="级别" width="100">
          <template #default="scope">
            <el-tag :type="getLogLevelType(scope.row.level)" size="small">
              {{ scope.row.level }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="type" label="类型" width="120" />
        <el-table-column prop="message" label="消息" />
        <el-table-column label="操作" width="100">
          <template #default="scope">
            <el-button
              v-if="scope.row.details"
              size="small"
              @click="showLogDetails(scope.row)"
            >
              详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="totalLogs"
          :page-sizes="[20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- 日志详情对话框 -->
    <el-dialog
      v-model="detailsVisible"
      title="日志详情"
      width="50%"
    >
      <pre class="log-details">{{ selectedLogDetails }}</pre>
    </el-dialog>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted, onUnmounted, watch } from 'vue';
import { ElMessage } from 'element-plus';
import * as echarts from 'echarts';
import dayjs from 'dayjs';
import { ipcRenderer } from 'electron';

interface SystemMetric {
  type: string;
  label: string;
  value: number;
  unit: string;
  percentage: number;
  threshold: number;
}

interface SystemLog {
  id: number;
  timestamp: string;
  level: string;
  type: string;
  message: string;
  details?: string;
}

export default defineComponent({
  name: 'SystemMonitor',

  setup() {
    const systemMetrics = ref<SystemMetric[]>([]);
    const selectedMetric = ref('cpu');
    const trendChart = ref<echarts.ECharts>();
    const updateInterval = ref<NodeJS.Timeout>();
    const logs = ref<SystemLog[]>([]);
    const logLevel = ref('');
    const currentPage = ref(1);
    const pageSize = ref(20);
    const totalLogs = ref(0);
    const detailsVisible = ref(false);
    const selectedLogDetails = ref('');

    // 初始化图表
    const initChart = () => {
      const chartDom = document.querySelector('.trend-card div');
      if (chartDom) {
        trendChart.value = echarts.init(chartDom);
      }
    };

    // 更新系统指标
    const updateMetrics = async () => {
      try {
        const status = await ipcRenderer.invoke('get-system-status');
        systemMetrics.value = [
          {
            type: 'cpu',
            label: 'CPU使用率',
            value: status.cpu,
            unit: '%',
            percentage: status.cpu,
            threshold: 80
          },
          {
            type: 'memory',
            label: '内存使用率',
            value: status.memory.used,
            unit: 'GB',
            percentage: (status.memory.used / status.memory.total) * 100,
            threshold: 80
          },
          {
            type: 'disk',
            label: '磁盘使用率',
            value: status.disk.used,
            unit: 'GB',
            percentage: (status.disk.used / status.disk.total) * 100,
            threshold: 80
          }
        ];
      } catch (error) {
        ElMessage.error('获取系统状态失败：' + error.message);
      }
    };

    // 更新趋势图
    const updateTrendChart = async () => {
      if (!trendChart.value) return;

      try {
        const response = await ipcRenderer.invoke('get-system-trend', {
          type: selectedMetric.value,
          hours: 1
        });

        const data = response.map((item: any) => ([
          item.timestamp,
          item.value
        ]));

        const option = {
          title: {
            text: `${getMetricLabel(selectedMetric.value)}趋势`
          },
          tooltip: {
            trigger: 'axis',
            formatter: (params: any) => {
              const time = dayjs(params[0].axisValue).format('HH:mm:ss');
              const value = params[0].value[1].toFixed(2);
              const unit = getMetricUnit(selectedMetric.value);
              return `${time}<br/>${value}${unit}`;
            }
          },
          xAxis: {
            type: 'time',
            axisLabel: {
              formatter: (value: number) => dayjs(value).format('HH:mm:ss')
            }
          },
          yAxis: {
            type: 'value',
            axisLabel: {
              formatter: (value: number) => `${value}${getMetricUnit(selectedMetric.value)}`
            }
          },
          series: [{
            data,
            type: 'line',
            smooth: true,
            areaStyle: {
              opacity: 0.3
            }
          }]
        };

        trendChart.value.setOption(option);
      } catch (error) {
        ElMessage.error('获取趋势数据失败：' + error.message);
      }
    };

    // 获取系统日志
    const fetchLogs = async () => {
      try {
        const response = await ipcRenderer.invoke('get-system-logs', {
          level: logLevel.value,
          page: currentPage.value,
          pageSize: pageSize.value
        });

        logs.value = response.logs;
        totalLogs.value = response.total;
      } catch (error) {
        ElMessage.error('获取系统日志失败：' + error.message);
      }
    };

    // 显示日志详情
    const showLogDetails = (log: SystemLog) => {
      selectedLogDetails.value = JSON.stringify(JSON.parse(log.details || '{}'), null, 2);
      detailsVisible.value = true;
    };

    // 刷新日志
    const refreshLogs = () => {
      currentPage.value = 1;
      fetchLogs();
    };

    // 处理分页变化
    const handleSizeChange = (size: number) => {
      pageSize.value = size;
      fetchLogs();
    };

    const handleCurrentChange = (page: number) => {
      currentPage.value = page;
      fetchLogs();
    };

    // 格式化时间
    const formatTime = (time: string) => {
      return dayjs(time).format('YYYY-MM-DD HH:mm:ss');
    };

    // 格式化数值
    const formatValue = (value: number, unit: string) => {
      if (unit === 'GB') {
        return `${(value / 1024 / 1024 / 1024).toFixed(1)} ${unit}`;
      }
      return `${value.toFixed(1)}${unit}`;
    };

    // 获取状态类型
    const getStatusType = (value: number, threshold: number) => {
      if (value >= threshold) return 'danger';
      if (value >= threshold * 0.8) return 'warning';
      return 'success';
    };

    // 获取状态文本
    const getStatusText = (value: number, threshold: number) => {
      if (value >= threshold) return '严重';
      if (value >= threshold * 0.8) return '警告';
      return '正常';
    };

    // 获取仪表盘颜色
    const getDashboardColor = (percentage: number) => {
      if (percentage >= 80) return '#F56C6C';
      if (percentage >= 60) return '#E6A23C';
      return '#67C23A';
    };

    // 获取日志级别类型
    const getLogLevelType = (level: string) => {
      switch (level) {
        case 'error': return 'danger';
        case 'warning': return 'warning';
        default: return 'info';
      }
    };

    // 获取指标标签
    const getMetricLabel = (type: string) => {
      switch (type) {
        case 'cpu': return 'CPU使用率';
        case 'memory': return '内存使用率';
        case 'disk': return '磁盘使用率';
        default: return '';
      }
    };

    // 获取指标单位
    const getMetricUnit = (type: string) => {
      switch (type) {
        case 'cpu': return '%';
        case 'memory': return 'GB';
        case 'disk': return 'GB';
        default: return '';
      }
    };

    // 监听窗口大小变化
    const handleResize = () => {
      trendChart.value?.resize();
    };

    onMounted(() => {
      window.addEventListener('resize', handleResize);
      initChart();
      updateMetrics();
      updateTrendChart();
      fetchLogs();

      // 定时更新数据
      updateInterval.value = setInterval(() => {
        updateMetrics();
        updateTrendChart();
      }, 5000);
    });

    onUnmounted(() => {
      window.removeEventListener('resize', handleResize);
      if (updateInterval.value) {
        clearInterval(updateInterval.value);
      }
      trendChart.value?.dispose();
    });

    // 监听选中指标变化
    watch(selectedMetric, () => {
      updateTrendChart();
    });

    // 监听日志级别变化
    watch(logLevel, () => {
      refreshLogs();
    });

    return {
      systemMetrics,
      selectedMetric,
      logs,
      logLevel,
      currentPage,
      pageSize,
      totalLogs,
      detailsVisible,
      selectedLogDetails,
      refreshLogs,
      handleSizeChange,
      handleCurrentChange,
      showLogDetails,
      formatTime,
      formatValue,
      getStatusType,
      getStatusText,
      getDashboardColor,
      getLogLevelType
    };
  }
});
</script>

<style scoped>
.system-monitor {
  padding: 20px;
}

.metric-card {
  margin-bottom: 20px;
}

.trend-card,
.log-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-controls {
  display: flex;
  gap: 10px;
}

.metric-value {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 180px;
}

.progress-value {
  font-size: 20px;
  font-weight: bold;
  display: block;
}

.progress-label {
  display: block;
  font-size: 14px;
  color: #909399;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.log-details {
  white-space: pre-wrap;
  word-wrap: break-word;
  background: #f5f7fa;
  padding: 15px;
  border-radius: 4px;
  font-family: monospace;
}
</style>`
