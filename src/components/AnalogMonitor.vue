<template>
  <div class="analog-monitor">
    <el-card class="analog-panel">
      <template #header>
        <div class="card-header">
          <span>模拟量监控</span>
          <el-switch
            v-model="autoScale"
            active-text="自动量程"
            inactive-text="固定量程"
            @change="handleAutoScaleChange"
          />
        </div>
      </template>
      
      <!-- 模拟量数值显示 -->
      <div class="analog-grid">
        <div v-for="point in analogPoints" :key="point.name" class="analog-item">
          <div class="analog-info">
            <span class="label">{{ point.description || point.name }}</span>
            <div class="value-container">
              <span class="value">{{ formatValue(point.value) }}</span>
              <span class="unit">{{ point.unit }}</span>
            </div>
          </div>
          <el-progress
            :percentage="calculatePercentage(point)"
            :color="getProgressColor(point)"
            :format="() => ''"
            :stroke-width="10"
          />
        </div>
      </div>
    </el-card>

    <!-- 趋势图 -->
    <el-card class="trend-panel">
      <template #header>
        <div class="card-header">
          <span>趋势图</span>
          <div class="trend-controls">
            <el-select v-model="selectedPoint" placeholder="选择监控点" size="small">
              <el-option
                v-for="point in analogPoints"
                :key="point.name"
                :label="point.description || point.name"
                :value="point.name"
              />
            </el-select>
            <el-select v-model="timeRange" placeholder="时间范围" size="small">
              <el-option label="最近10分钟" value="10" />
              <el-option label="最近30分钟" value="30" />
              <el-option label="最近1小时" value="60" />
            </el-select>
          </div>
        </div>
      </template>
      <v-chart class="trend-chart" :option="chartOption" autoresize />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { usePLCStore } from '../stores/plc'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  DataZoomComponent,
  ToolboxComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

// 注册 ECharts 组件
use([
  CanvasRenderer,
  LineChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  DataZoomComponent,
  ToolboxComponent
])

// 存储相关
const plcStore = usePLCStore()
const { analogValues } = storeToRefs(plcStore)

// 组件状态
const autoScale = ref(true)
const selectedPoint = ref('')
const timeRange = ref('10')
const historicalData = ref<{ time: number; value: number }[]>([])

// 模拟量点位配置
const analogPoints = computed(() => {
  return Object.entries(analogValues.value).map(([name, value]) => ({
    name,
    value,
    description: '模拟量' + name, // 这里应该从配置中获取
    unit: 'mA',                  // 这里应该从配置中获取
    minValue: 0,                 // 这里应该从配置中获取
    maxValue: 100                // 这里应该从配置中获取
  }))
})

// 在组件挂载时选择第一个点位
onMounted(() => {
  if (analogPoints.value.length > 0) {
    selectedPoint.value = analogPoints.value[0].name
  }
})

// 格式化数值显示
const formatValue = (value: number) => {
  return value.toFixed(2)
}

// 计算进度条百分比
const calculatePercentage = (point: any) => {
  if (autoScale.value) {
    // 自动量程模式：使用当前值范围
    const values = Object.values(analogValues.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    return ((point.value - min) / (max - min)) * 100
  } else {
    // 固定量程模式：使用配置的量程
    return ((point.value - point.minValue) / (point.maxValue - point.minValue)) * 100
  }
}

// 获取进度条颜色
const getProgressColor = (point: any) => {
  const percentage = calculatePercentage(point)
  if (percentage > 90) return '#F56C6C'
  if (percentage > 70) return '#E6A23C'
  return '#67C23A'
}

// 处理自动量程变化
const handleAutoScaleChange = () => {
  // 这里可以添加其他处理逻辑
}

// 图表配置
const chartOption = computed(() => {
  const selectedPointData = analogPoints.value.find(p => p.name === selectedPoint.value)
  
  return {
    title: {
      text: selectedPointData ? (selectedPointData.description || selectedPointData.name) : '',
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const data = params[0]
        return `${new Date(data.value[0]).toLocaleTimeString()}<br/>${data.value[1].toFixed(2)}${selectedPointData?.unit || ''}`
      }
    },
    xAxis: {
      type: 'time',
      splitLine: {
        show: false
      }
    },
    yAxis: {
      type: 'value',
      name: selectedPointData?.unit || '',
      splitLine: {
        show: true,
        lineStyle: {
          type: 'dashed'
        }
      }
    },
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100
      },
      {
        show: true,
        type: 'slider',
        bottom: 10
      }
    ],
    series: [
      {
        name: selectedPointData?.description || selectedPointData?.name,
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: historicalData.value.map(item => [item.time, item.value]),
        itemStyle: {
          color: '#409EFF'
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              {
                offset: 0,
                color: 'rgba(64,158,255,0.2)'
              },
              {
                offset: 1,
                color: 'rgba(64,158,255,0)'
              }
            ]
          }
        }
      }
    ]
  }
})

// 更新历史数据
const updateHistoricalData = () => {
  if (!selectedPoint.value) return
  
  const currentValue = analogValues.value[selectedPoint.value]
  const currentTime = Date.now()
  
  // 添加新数据点
  historicalData.value.push({
    time: currentTime,
    value: currentValue
  })
  
  // 移除超出时间范围的数据
  const timeWindow = parseInt(timeRange.value) * 60 * 1000 // 转换为毫秒
  historicalData.value = historicalData.value.filter(
    item => currentTime - item.time <= timeWindow
  )
}

// 监听选中点位变化
watch(selectedPoint, () => {
  historicalData.value = [] // 清空历史数据
})

// 监听时间范围变化
watch(timeRange, () => {
  historicalData.value = [] // 清空历史数据
})

// 定时更新数据
let updateTimer: number
onMounted(() => {
  updateTimer = window.setInterval(updateHistoricalData, 1000)
})

onUnmounted(() => {
  if (updateTimer) {
    clearInterval(updateTimer)
  }
})
</script>

<style scoped lang="scss">
.analog-monitor {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 15px;
  
  .analog-panel, .trend-panel {
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
  }
  
  .analog-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 20px;
    padding: 10px;
  }
  
  .analog-item {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 15px;
    
    .analog-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      
      .label {
        font-size: 14px;
        color: #606266;
      }
      
      .value-container {
        display: flex;
        align-items: baseline;
        gap: 4px;
        
        .value {
          font-size: 20px;
          font-weight: bold;
          color: #303133;
        }
        
        .unit {
          font-size: 12px;
          color: #909399;
        }
      }
    }
  }
  
  .trend-panel {
    .trend-controls {
      display: flex;
      gap: 10px;
    }
    
    .trend-chart {
      height: 400px;
      width: 100%;
    }
  }
}

// 移动端适配
@media screen and (max-width: 768px) {
  .analog-monitor {
    padding: 10px;
    
    .analog-grid {
      grid-template-columns: 1fr;
      gap: 15px;
    }
    
    .trend-panel {
      .trend-controls {
        flex-direction: column;
        gap: 5px;
      }
      
      .trend-chart {
        height: 300px;
      }
    }
  }
}
</style>
