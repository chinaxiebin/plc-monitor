<template>
  <div class="database-manager">
    <a-card title="数据库管理" :bordered="false">
      <!-- 状态概览 -->
      <a-row :gutter="16" class="status-overview">
        <a-col :span="8">
          <a-statistic
            title="PLC 数量"
            :value="stats.plcCount"
            :loading="loading"
          />
        </a-col>
        <a-col :span="8">
          <a-statistic
            title="监控点位"
            :value="stats.pointCount"
            :loading="loading"
          />
        </a-col>
        <a-col :span="8">
          <a-statistic
            title="报警规则"
            :value="stats.alarmCount"
            :loading="loading"
          />
        </a-col>
      </a-row>

      <!-- 操作按钮 -->
      <a-row :gutter="16" class="action-buttons">
        <a-col :span="6">
          <a-button
            type="primary"
            icon="cloud-upload"
            :loading="importing"
            @click="handleImport"
          >
            导入配置
          </a-button>
        </a-col>
        <a-col :span="6">
          <a-button
            icon="cloud-download"
            :loading="exporting"
            @click="handleExport"
          >
            导出配置
          </a-button>
        </a-col>
        <a-col :span="6">
          <a-button
            type="primary"
            icon="save"
            :loading="backingUp"
            @click="handleBackup"
          >
            创建备份
          </a-button>
        </a-col>
        <a-col :span="6">
          <a-button
            danger
            icon="reload"
            :loading="restoring"
            @click="handleRestore"
          >
            恢复备份
          </a-button>
        </a-col>
      </a-row>

      <!-- 备份列表 -->
      <a-table
        :columns="backupColumns"
        :data-source="backupFiles"
        :loading="loadingBackups"
        rowKey="path"
        class="backup-list"
      >
        <template #action="{ record }">
          <a-space>
            <a-button type="link" @click="handleRestore(record.path)">
              恢复
            </a-button>
            <a-button type="link" danger @click="handleDeleteBackup(record.path)">
              删除
            </a-button>
          </a-space>
        </template>
      </a-table>

      <!-- 日志面板 -->
      <a-collapse class="log-panel">
        <a-collapse-panel key="1" header="操作日志">
          <a-list
            :data-source="logs"
            :loading="loadingLogs"
            size="small"
          >
            <template #renderItem="{ item }">
              <a-list-item>
                <a-tag :color="item.type === 'error' ? 'red' : 'blue'">
                  {{ item.time }}
                </a-tag>
                {{ item.message }}
              </a-list-item>
            </template>
          </a-list>
        </a-collapse-panel>
      </a-collapse>
    </a-card>

    <!-- 导入配置对话框 -->
    <a-modal
      v-model:visible="importModalVisible"
      title="导入配置"
      @ok="confirmImport"
      @cancel="cancelImport"
      :confirmLoading="importing"
    >
      <a-upload
        :before-upload="beforeUpload"
        :file-list="fileList"
        @remove="handleRemove"
      >
        <a-button icon="upload">选择文件</a-button>
      </a-upload>
      <a-alert
        v-if="importErrors.length > 0"
        type="error"
        show-icon
        class="import-errors"
      >
        <template #message>
          导入错误
        </template>
        <template #description>
          <ul>
            <li v-for="error in importErrors" :key="error">{{ error }}</li>
          </ul>
        </template>
      </a-alert>
    </a-modal>

    <!-- 恢复备份对话框 -->
    <a-modal
      v-model:visible="restoreModalVisible"
      title="恢复备份"
      @ok="confirmRestore"
      @cancel="cancelRestore"
      :confirmLoading="restoring"
    >
      <p>确定要恢复选中的备份吗？此操作将覆盖当前的所有数据！</p>
      <a-alert
        type="warning"
        message="请确保已备份当前数据"
        description="恢复操作不可撤销，建议先备份当前数据。"
        show-icon
      />
    </a-modal>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import type { UploadProps } from 'ant-design-vue';
import { ipcRenderer } from 'electron';

interface BackupFile {
  path: string;
  size: number;
  time: string;
}

interface LogEntry {
  time: string;
  type: 'info' | 'error';
  message: string;
}

interface Stats {
  plcCount: number;
  pointCount: number;
  alarmCount: number;
}

export default defineComponent({
  name: 'DatabaseManager',
  setup() {
    // 状态
    const loading = ref(false);
    const importing = ref(false);
    const exporting = ref(false);
    const backingUp = ref(false);
    const restoring = ref(false);
    const loadingBackups = ref(false);
    const loadingLogs = ref(false);

    // 数据
    const stats = ref<Stats>({
      plcCount: 0,
      pointCount: 0,
      alarmCount: 0,
    });
    const backupFiles = ref<BackupFile[]>([]);
    const logs = ref<LogEntry[]>([]);
    const importErrors = ref<string[]>([]);

    // 模态框
    const importModalVisible = ref(false);
    const restoreModalVisible = ref(false);
    const fileList = ref<any[]>([]);

    // 表格列定义
    const backupColumns = [
      {
        title: '备份时间',
        dataIndex: 'time',
        key: 'time',
      },
      {
        title: '文件大小',
        dataIndex: 'size',
        key: 'size',
        customRender: ({ text }: { text: number }) => {
          return `${(text / 1024).toFixed(2)} KB`;
        },
      },
      {
        title: '操作',
        key: 'action',
        slots: { customRender: 'action' },
      },
    ];

    // 加载数据
    const loadStats = async () => {
      loading.value = true;
      try {
        const response = await ipcRenderer.invoke('database:getStats');
        stats.value = response;
      } catch (error) {
        message.error('加载统计信息失败');
      } finally {
        loading.value = false;
      }
    };

    const loadBackups = async () => {
      loadingBackups.value = true;
      try {
        const response = await ipcRenderer.invoke('database:getBackups');
        backupFiles.value = response;
      } catch (error) {
        message.error('加载备份列表失败');
      } finally {
        loadingBackups.value = false;
      }
    };

    const loadLogs = async () => {
      loadingLogs.value = true;
      try {
        const response = await ipcRenderer.invoke('database:getLogs');
        logs.value = response;
      } catch (error) {
        message.error('加载日志失败');
      } finally {
        loadingLogs.value = false;
      }
    };

    // 文件上传
    const beforeUpload: UploadProps['beforeUpload'] = (file) => {
      fileList.value = [file];
      return false;
    };

    const handleRemove = () => {
      fileList.value = [];
    };

    // 导入导出
    const handleImport = () => {
      importModalVisible.value = true;
      importErrors.value = [];
    };

    const confirmImport = async () => {
      if (fileList.value.length === 0) {
        message.warning('请选择要导入的文件');
        return;
      }

      importing.value = true;
      try {
        const result = await ipcRenderer.invoke(
          'database:import',
          fileList.value[0].path
        );
        if (result.success) {
          message.success('导入成功');
          importModalVisible.value = false;
          loadStats();
        } else {
          importErrors.value = result.errors;
        }
      } catch (error) {
        message.error('导入失败');
      } finally {
        importing.value = false;
      }
    };

    const cancelImport = () => {
      importModalVisible.value = false;
      fileList.value = [];
      importErrors.value = [];
    };

    const handleExport = async () => {
      exporting.value = true;
      try {
        const result = await ipcRenderer.invoke('database:export');
        if (result.success) {
          message.success('导出成功');
        } else {
          message.error(result.error);
        }
      } finally {
        exporting.value = false;
      }
    };

    // 备份恢复
    const handleBackup = async () => {
      backingUp.value = true;
      try {
        const result = await ipcRenderer.invoke('database:backup');
        if (result.success) {
          message.success('备份成功');
          loadBackups();
        } else {
          message.error(result.error);
        }
      } finally {
        backingUp.value = false;
      }
    };

    const handleRestore = (path?: string) => {
      if (path) {
        restoreModalVisible.value = true;
      }
    };

    const confirmRestore = async () => {
      restoring.value = true;
      try {
        const result = await ipcRenderer.invoke('database:restore');
        if (result.success) {
          message.success('恢复成功');
          restoreModalVisible.value = false;
          loadStats();
        } else {
          message.error(result.error);
        }
      } finally {
        restoring.value = false;
      }
    };

    const cancelRestore = () => {
      restoreModalVisible.value = false;
    };

    const handleDeleteBackup = async (path: string) => {
      try {
        const result = await ipcRenderer.invoke('database:deleteBackup', path);
        if (result.success) {
          message.success('删除成功');
          loadBackups();
        } else {
          message.error(result.error);
        }
      } catch (error) {
        message.error('删除失败');
      }
    };

    // 生命周期
    onMounted(() => {
      loadStats();
      loadBackups();
      loadLogs();

      // 监听数据库事件
      ipcRenderer.on('database:updated', () => {
        loadStats();
      });

      ipcRenderer.on('database:log', (_, log: LogEntry) => {
        logs.value = [log, ...logs.value].slice(0, 100);
      });
    });

    return {
      // 状态
      loading,
      importing,
      exporting,
      backingUp,
      restoring,
      loadingBackups,
      loadingLogs,

      // 数据
      stats,
      backupFiles,
      logs,
      importErrors,
      backupColumns,

      // 模态框
      importModalVisible,
      restoreModalVisible,
      fileList,

      // 方法
      beforeUpload,
      handleRemove,
      handleImport,
      confirmImport,
      cancelImport,
      handleExport,
      handleBackup,
      handleRestore,
      confirmRestore,
      cancelRestore,
      handleDeleteBackup,
    };
  },
});
</script>

<style scoped>
.database-manager {
  padding: 24px;
}

.status-overview {
  margin-bottom: 24px;
}

.action-buttons {
  margin-bottom: 24px;
}

.backup-list {
  margin-bottom: 24px;
}

.log-panel {
  margin-top: 24px;
}

.import-errors {
  margin-top: 16px;
}

:deep(.ant-upload-list) {
  margin-top: 16px;
}
</style>
