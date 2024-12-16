<template>
  <div class="config-manager">
    <h2>配置管理</h2>
    
    <div class="actions">
      <div class="action-group">
        <h3>配置导入/导出</h3>
        <input
          type="file"
          ref="fileInput"
          @change="handleFileChange"
          accept=".xlsx"
          style="display: none"
        />
        <button @click="triggerFileInput" class="btn primary">
          选择Excel文件
        </button>
        <button
          @click="uploadFile"
          :disabled="!selectedFile"
          class="btn secondary"
        >
          导入
        </button>
        <button @click="downloadTemplate" class="btn primary">
          下载模板
        </button>
        <button @click="exportConfig" class="btn secondary">
          导出当前配置
        </button>
      </div>

      <div class="action-group">
        <h3>备份管理</h3>
        <button @click="createBackup" class="btn primary">
          创建备份
        </button>
        <input
          type="file"
          ref="backupInput"
          @change="handleBackupFileChange"
          accept=".zip"
          style="display: none"
        />
        <button @click="triggerBackupInput" class="btn secondary">
          选择备份文件
        </button>
        <button
          @click="restoreBackup"
          :disabled="!selectedBackupFile"
          class="btn warning"
        >
          恢复备份
        </button>
      </div>
    </div>

    <!-- 配置预览 -->
    <div class="preview-section" v-if="previewData">
      <h3>配置预览</h3>
      <a-tabs v-model:activeKey="activeTab">
        <a-tab-pane key="plc" tab="PLC配置">
          <a-table :columns="plcColumns" :dataSource="previewData.plcConfigs" size="small" />
        </a-tab-pane>
        <a-tab-pane key="points" tab="监控点配置">
          <a-table :columns="pointColumns" :dataSource="previewData.points" size="small" />
        </a-tab-pane>
        <a-tab-pane key="alarms" tab="报警配置">
          <a-table :columns="alarmColumns" :dataSource="previewData.alarms" size="small" />
        </a-tab-pane>
      </a-tabs>
    </div>

    <!-- 确认对话框 -->
    <a-modal
      v-model:visible="confirmVisible"
      title="确认操作"
      @ok="handleConfirm"
      :confirmLoading="confirmLoading"
    >
      <p>{{ confirmMessage }}</p>
    </a-modal>

    <div v-if="message" :class="['message', messageType]">
      {{ message }}
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref } from 'vue'
import { message } from 'ant-design-vue'

export default defineComponent({
  name: 'ConfigManager',
  
  setup() {
    const fileInput = ref<HTMLInputElement | null>(null)
    const selectedFile = ref<File | null>(null)
    const backupInput = ref<HTMLInputElement | null>(null)
    const selectedBackupFile = ref<File | null>(null)
    const message = ref('')
    const messageType = ref('')
    const previewData = ref<any>(null)
    const activeTab = ref('plc')
    const plcColumns = ref<any[]>([
      { title: 'PLC名称', dataIndex: 'name' },
      { title: 'PLC地址', dataIndex: 'address' },
    ])
    const pointColumns = ref<any[]>([
      { title: '监控点名称', dataIndex: 'name' },
      { title: '监控点地址', dataIndex: 'address' },
    ])
    const alarmColumns = ref<any[]>([
      { title: '报警名称', dataIndex: 'name' },
      { title: '报警地址', dataIndex: 'address' },
    ])
    const confirmVisible = ref(false)
    const confirmLoading = ref(false)
    const confirmMessage = ref('')

    const showMessage = (text: string, type: 'success' | 'error') => {
      message.value = text
      messageType.value = type
      setTimeout(() => {
        message.value = ''
        messageType.value = ''
      }, 3000)
    }

    const triggerFileInput = () => {
      fileInput.value?.click()
    }

    const handleFileChange = (event: Event) => {
      const input = event.target as HTMLInputElement
      if (input.files && input.files.length > 0) {
        selectedFile.value = input.files[0]
      }
    }

    const uploadFile = async () => {
      if (!selectedFile.value) return

      const formData = new FormData()
      formData.append('file', selectedFile.value)

      try {
        const response = await fetch('/api/config/import', {
          method: 'POST',
          body: formData
        })

        if (response.ok) {
          showMessage('配置导入成功', 'success')
          selectedFile.value = null
          if (fileInput.value) {
            fileInput.value.value = ''
          }
        } else {
          const error = await response.json()
          throw new Error(error.message || '导入失败')
        }
      } catch (error) {
        showMessage(error instanceof Error ? error.message : '导入失败', 'error')
      }
    }

    const downloadTemplate = async () => {
      try {
        const response = await fetch('/api/config/template')
        if (response.ok) {
          const blob = await response.blob()
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'config_template.xlsx'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          window.URL.revokeObjectURL(url)
        } else {
          throw new Error('下载模板失败')
        }
      } catch (error) {
        showMessage(error instanceof Error ? error.message : '下载模板失败', 'error')
      }
    }

    const exportConfig = async () => {
      try {
        const response = await fetch('/api/config/export')
        if (response.ok) {
          const blob = await response.blob()
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'current_config.xlsx'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          window.URL.revokeObjectURL(url)
        } else {
          throw new Error('导出配置失败')
        }
      } catch (error) {
        showMessage(error instanceof Error ? error.message : '导出配置失败', 'error')
      }
    }

    const createBackup = async () => {
      try {
        const response = await fetch('/api/config/backup')
        if (response.ok) {
          const blob = await response.blob()
          const url = window.URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'config_backup.zip'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          window.URL.revokeObjectURL(url)
        } else {
          throw new Error('创建备份失败')
        }
      } catch (error) {
        showMessage(error instanceof Error ? error.message : '创建备份失败', 'error')
      }
    }

    const triggerBackupInput = () => {
      backupInput.value?.click()
    }

    const handleBackupFileChange = (event: Event) => {
      const input = event.target as HTMLInputElement
      if (input.files && input.files.length > 0) {
        selectedBackupFile.value = input.files[0]
      }
    }

    const restoreBackup = async () => {
      if (!selectedBackupFile.value) return

      const formData = new FormData()
      formData.append('file', selectedBackupFile.value)

      try {
        const response = await fetch('/api/config/restore', {
          method: 'POST',
          body: formData
        })

        if (response.ok) {
          showMessage('备份恢复成功', 'success')
          selectedBackupFile.value = null
          if (backupInput.value) {
            backupInput.value.value = ''
          }
        } else {
          const error = await response.json()
          throw new Error(error.message || '恢复失败')
        }
      } catch (error) {
        showMessage(error instanceof Error ? error.message : '恢复失败', 'error')
      }
    }

    const handleConfirm = async () => {
      confirmLoading.value = true
      try {
        // 确认操作逻辑
      } catch (error) {
        showMessage(error instanceof Error ? error.message : '操作失败', 'error')
      } finally {
        confirmLoading.value = false
        confirmVisible.value = false
      }
    }

    return {
      fileInput,
      selectedFile,
      backupInput,
      selectedBackupFile,
      message,
      messageType,
      previewData,
      activeTab,
      plcColumns,
      pointColumns,
      alarmColumns,
      confirmVisible,
      confirmLoading,
      confirmMessage,
      triggerFileInput,
      handleFileChange,
      uploadFile,
      downloadTemplate,
      exportConfig,
      createBackup,
      triggerBackupInput,
      handleBackupFileChange,
      restoreBackup,
      handleConfirm,
    }
  }
})
</script>

<style scoped>
.config-manager {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

h2 {
  color: #2c3e50;
  margin-bottom: 30px;
}

.actions {
  display: flex;
  gap: 40px;
  margin-bottom: 30px;
}

.action-group {
  flex: 1;
  background: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

h3 {
  color: #2c3e50;
  margin-bottom: 20px;
}

.btn {
  display: block;
  width: 100%;
  padding: 10px;
  margin-bottom: 10px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.3s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.primary {
  background-color: #4CAF50;
  color: white;
}

.primary:hover:not(:disabled) {
  background-color: #45a049;
}

.secondary {
  background-color: #2196F3;
  color: white;
}

.secondary:hover:not(:disabled) {
  background-color: #1e88e5;
}

.warning {
  background-color: #FF9800;
  color: white;
}

.warning:hover:not(:disabled) {
  background-color: #FFA07A;
}

.preview-section {
  margin-top: 20px;
}

.message {
  padding: 10px;
  border-radius: 4px;
  margin-top: 20px;
  text-align: center;
}

.success {
  background-color: #dff0d8;
  color: #3c763d;
  border: 1px solid #d6e9c6;
}

.error {
  background-color: #f2dede;
  color: #a94442;
  border: 1px solid #ebccd1;
}
</style>
