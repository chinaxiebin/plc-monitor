<template>
  <div class="register-monitor">
    <h3>数据寄存器监控</h3>
    <el-table :data="registers" style="width: 100%">
      <el-table-column prop="address" label="地址" width="100" />
      <el-table-column prop="description" label="描述" width="200" />
      <el-table-column prop="value" label="当前值" width="120">
        <template #default="{ row }">
          <div class="value-display">
            <span>{{ formatValue(row.value, row.format) }}</span>
            <el-dropdown trigger="click" @command="(cmd) => handleFormatChange(row, cmd)">
              <el-button type="text">
                {{ row.format }}
                <i class="el-icon-arrow-down"></i>
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="DEC">DEC</el-dropdown-item>
                  <el-dropdown-item command="HEX">HEX</el-dropdown-item>
                  <el-dropdown-item command="BIN">BIN</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="设定值" width="200">
        <template #default="{ row }">
          <el-input
            v-model="row.newValue"
            :placeholder="getPlaceholder(row.format)"
            @input="handleValueInput(row)"
            size="small"
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
const { registers } = storeToRefs(plcStore)

const formatValue = (value: number, format: string) => {
  if (value === undefined) return '-'
  switch (format) {
    case 'HEX':
      return '0x' + value.toString(16).toUpperCase()
    case 'BIN':
      return '0b' + value.toString(2).padStart(16, '0')
    default:
      return value.toString()
  }
}

const getPlaceholder = (format: string) => {
  switch (format) {
    case 'HEX':
      return '0xFFFF'
    case 'BIN':
      return '0b0000000000000000'
    default:
      return '65535'
  }
}

const handleFormatChange = (row: TagConfig, format: string) => {
  row.format = format
}

const handleValueInput = (row: TagConfig) => {
  if (!row.newValue) return

  try {
    let value: number
    if (row.format === 'HEX' && row.newValue.startsWith('0x')) {
      value = parseInt(row.newValue.slice(2), 16)
    } else if (row.format === 'BIN' && row.newValue.startsWith('0b')) {
      value = parseInt(row.newValue.slice(2), 2)
    } else {
      value = parseInt(row.newValue)
    }

    if (isNaN(value) || value < 0 || value > 65535) {
      row.newValue = ''
      return
    }

    row.parsedValue = value
  } catch (error) {
    row.newValue = ''
  }
}

const handleWrite = async (row: TagConfig) => {
  if (row.parsedValue === undefined) return
  
  row.writing = true
  try {
    await plcStore.writeRegister(row.address, row.parsedValue)
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
  plcStore.subscribeRegisters()
})

// 组件卸载时取消订阅
onUnmounted(() => {
  plcStore.unsubscribeRegisters()
})
</script>

<style scoped>
.register-monitor {
  padding: 20px;
}

h3 {
  margin-bottom: 20px;
  color: #2c3e50;
}

.value-display {
  display: flex;
  align-items: center;
  gap: 10px;
}

.el-dropdown {
  margin-left: 8px;
}
</style>
