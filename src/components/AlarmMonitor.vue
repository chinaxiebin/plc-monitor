&lt;template>
  &lt;div class="alarm-monitor">
    &lt;el-tabs v-model="activeTab">
      <!-- 活跃报警 -->
      &lt;el-tab-pane label="活跃报警" name="active">
        &lt;el-table :data="activeAlarms" style="width: 100%" :max-height="400">
          &lt;el-table-column prop="triggered_at" label="触发时间" width="180">
            &lt;template #default="{ row }">
              {{ formatDate(row.triggered_at) }}
            &lt;/template>
          &lt;/el-table-column>
          &lt;el-table-column prop="point_name" label="点位名称" width="150" />
          &lt;el-table-column prop="description" label="报警描述" />
          &lt;el-table-column prop="value" label="报警值" width="100" />
          &lt;el-table-column prop="priority" label="优先级" width="80">
            &lt;template #default="{ row }">
              &lt;el-tag :type="getPriorityType(row.priority)">
                {{ getPriorityLabel(row.priority) }}
              &lt;/el-tag>
            &lt;/template>
          &lt;/el-table-column>
          &lt;el-table-column label="操作" width="100">
            &lt;template #default="{ row }">
              &lt;el-button
                type="primary"
                size="small"
                @click="acknowledgeAlarm(row.id)"
                :disabled="!!row.acknowledged_at"
              >
                确认
              &lt;/el-button>
            &lt;/template>
          &lt;/el-table-column>
        &lt;/el-table>
      &lt;/el-tab-pane>

      <!-- 历史报警 -->
      &lt;el-tab-pane label="历史报警" name="history">
        &lt;div class="filter-bar">
          &lt;el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            @change="loadAlarmHistory"
          />
          &lt;el-select
            v-model="selectedPoint"
            placeholder="选择点位"
            clearable
            @change="loadAlarmHistory"
          >
            &lt;el-option
              v-for="point in points"
              :key="point.id"
              :label="point.name"
              :value="point.id"
            />
          &lt;/el-select>
          &lt;el-select
            v-model="selectedPriority"
            placeholder="选择优先级"
            clearable
            @change="loadAlarmHistory"
          >
            &lt;el-option
              v-for="priority in priorities"
              :key="priority.value"
              :label="priority.label"
              :value="priority.value"
            />
          &lt;/el-select>
        &lt;/div>

        &lt;el-table :data="historyAlarms" style="width: 100%" :max-height="400">
          &lt;el-table-column prop="triggered_at" label="触发时间" width="180">
            &lt;template #default="{ row }">
              {{ formatDate(row.triggered_at) }}
            &lt;/template>
          &lt;/el-table-column>
          &lt;el-table-column prop="point_name" label="点位名称" width="150" />
          &lt;el-table-column prop="description" label="报警描述" />
          &lt;el-table-column prop="value" label="报警值" width="100" />
          &lt;el-table-column prop="priority" label="优先级" width="80">
            &lt;template #default="{ row }">
              &lt;el-tag :type="getPriorityType(row.priority)">
                {{ getPriorityLabel(row.priority) }}
              &lt;/el-tag>
            &lt;/template>
          &lt;/el-table-column>
          &lt;el-table-column prop="acknowledged_at" label="确认时间" width="180">
            &lt;template #default="{ row }">
              {{ row.acknowledged_at ? formatDate(row.acknowledged_at) : '-' }}
            &lt;/template>
          &lt;/el-table-column>
          &lt;el-table-column prop="acknowledged_by" label="确认人" width="100" />
        &lt;/el-table>
      &lt;/el-tab-pane>
    &lt;/el-tabs>
  &lt;/div>
&lt;/template>

&lt;script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { usePLCSocket } from '@/composables/usePLCSocket';
import dayjs from 'dayjs';

const socket = usePLCSocket();
const activeTab = ref('active');
const activeAlarms = ref([]);
const historyAlarms = ref([]);
const points = ref([]);
const dateRange = ref([]);
const selectedPoint = ref(null);
const selectedPriority = ref(null);

const priorities = [
  { value: 1, label: '高' },
  { value: 2, label: '中' },
  { value: 3, label: '低' }
];

// 格式化日期
const formatDate = (date: string) => {
  return dayjs(date).format('YYYY-MM-DD HH:mm:ss');
};

// 获取优先级标签
const getPriorityLabel = (priority: number) => {
  return priorities.find(p => p.value === priority)?.label || '未知';
};

// 获取优先级标签类型
const getPriorityType = (priority: number) => {
  switch (priority) {
    case 1: return 'danger';
    case 2: return 'warning';
    case 3: return 'info';
    default: return '';
  }
};

// 加载活跃报警
const loadActiveAlarms = async () => {
  try {
    const response = await fetch('/api/alarms/active');
    if (response.ok) {
      activeAlarms.value = await response.json();
    }
  } catch (error) {
    console.error('Failed to load active alarms:', error);
    ElMessage.error('加载活跃报警失败');
  }
};

// 加载历史报警
const loadAlarmHistory = async () => {
  try {
    const params = new URLSearchParams();
    if (dateRange.value?.[0]) {
      params.append('startDate', dateRange.value[0].toISOString());
    }
    if (dateRange.value?.[1]) {
      params.append('endDate', dateRange.value[1].toISOString());
    }
    if (selectedPoint.value) {
      params.append('pointId', selectedPoint.value);
    }
    if (selectedPriority.value) {
      params.append('priority', selectedPriority.value);
    }

    const response = await fetch(`/api/alarms/history?${params}`);
    if (response.ok) {
      historyAlarms.value = await response.json();
    }
  } catch (error) {
    console.error('Failed to load alarm history:', error);
    ElMessage.error('加载历史报警失败');
  }
};

// 确认报警
const acknowledgeAlarm = async (alarmId: number) => {
  try {
    const response = await fetch(`/api/alarms/${alarmId}/acknowledge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        acknowledgedBy: 'Current User' // TODO: 替换为实际的用户名
      })
    });

    if (response.ok) {
      ElMessage.success('报警已确认');
      loadActiveAlarms();
    }
  } catch (error) {
    console.error('Failed to acknowledge alarm:', error);
    ElMessage.error('确认报警失败');
  }
};

// 加载点位列表
const loadPoints = async () => {
  try {
    const response = await fetch('/api/points');
    if (response.ok) {
      points.value = await response.json();
    }
  } catch (error) {
    console.error('Failed to load points:', error);
    ElMessage.error('加载点位列表失败');
  }
};

// 监听新报警
socket.on('alarm', (alarm) => {
  loadActiveAlarms();
  // 播放报警声音
  const audio = new Audio('/alarm.mp3');
  audio.play();
});

onMounted(() => {
  loadActiveAlarms();
  loadPoints();
});
&lt;/script>

&lt;style scoped>
.alarm-monitor {
  padding: 20px;
}

.filter-bar {
  margin-bottom: 20px;
  display: flex;
  gap: 16px;
}

:deep(.el-tag) {
  width: 40px;
  text-align: center;
}
&lt;/style>
