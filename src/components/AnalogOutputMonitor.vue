<template>
  <div class="analog-output-monitor">
    <h3>模拟量输出监控</h3>
    <el-table :data="analogOutputs" style="width: 100%">
      <el-table-column prop="address" label="地址" width="100" />
      <el-table-column prop="description" label="描述" width="200" />
      <el-table-column prop="value" label="当前值" width="120">
        <template #default="{ row }">
          {{ formatValue(row.value) }}
        </template>
      </el-table-column>
      <el-table-column prop="unit" label="单位" width="80" />
      <el-table-column label="设定值" width="200">
        <template #default="{ row }">
          <el-input-number
            v-model="row.newValue"
            :min="row.minValue"
            :max="row.maxValue"
            :step="row.scale || 1"
            size="small"
            @change="handleValueChange(row)"
          />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="120">
        <template #default="{ row }">
          <el-button
            type="primary"
            size="small"
            @click="handleWrite(row)"
            :loading="row.writing"
          >
            写入
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { usePLCStore } from '@/stores/plc'
import { storeToRefs } from 'pinia'
import type { TagConfig } from '@/types'
import { ElMessage } from 'element-plus'

const plcStore = usePLCStore()
const { analogOutputs } = storeToRefs(plcStore)

const formatValue = (value: number) => {
  return value?.toFixed(2) ?? '-'
}

const handleValueChange = (row: TagConfig) => {
  if (row.newValue === undefined) return
  row.newValue = Number(row.newValue.toFixed(2))
}

const handleWrite = async (row: TagConfig) => {
  if (row.newValue === undefined) return
  
  row.writing = true
  try {
    await plcStore.writeAnalogOutput(row.address, row.newValue)
    ElMessage.success('写入成功')
  } catch (error) {
    console.error('写入失败:', error)
    ElMessage.error('写入失败')
  } finally {
    row.writing = false
  }
}

// 组件挂载时订阅更新
onMounted(() => {
  plcStore.subscribeAnalogOutputs()
})

// 组件卸载时取消订阅
onUnmounted(() => {
  plcStore.unsubscribeAnalogOutputs()
})
</script>

<style scoped>
.analog-output-monitor {
  padding: 20px;
}

h3 {
  margin-bottom: 20px;
  color: #2c3e50;
}
</style>
