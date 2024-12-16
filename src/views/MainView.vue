`<template>
  <el-container class="main-container">
    <el-aside width="200px">
      <el-menu
        :default-active="activeMenu"
        class="main-menu"
        @select="handleMenuSelect"
      >
        <el-menu-item index="monitor">
          <el-icon><Monitor /></el-icon>
          <span>实时监控</span>
        </el-menu-item>
        <el-menu-item index="data">
          <el-icon><DataLine /></el-icon>
          <span>数据分析</span>
        </el-menu-item>
        <el-menu-item index="system">
          <el-icon><Operation /></el-icon>
          <span>系统监控</span>
        </el-menu-item>
        <el-menu-item index="config">
          <el-icon><Setting /></el-icon>
          <span>系统配置</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header>
        <div class="header-left">
          <h2>PLC监控系统</h2>
        </div>
        <div class="header-right">
          <el-button-group>
            <el-button :type="isRunning ? 'success' : 'primary'" @click="toggleService">
              {{ isRunning ? '运行中' : '已停止' }}
            </el-button>
            <el-button @click="showSettings">
              <el-icon><Setting /></el-icon>
            </el-button>
          </el-button-group>
        </div>
      </el-header>

      <el-main>
        <component :is="currentComponent" />
      </el-main>

      <el-footer>
        <div class="footer-content">
          <span>版本: v1.0.0</span>
          <span>© 2024 PLC Monitor. All rights reserved.</span>
        </div>
      </el-footer>
    </el-container>

    <!-- 设置对话框 -->
    <el-dialog
      v-model="settingsVisible"
      title="系统设置"
      width="600px"
    >
      <el-form :model="settings" label-width="120px">
        <el-form-item label="数据保存天数">
          <el-input-number
            v-model="settings.dataRetentionDays"
            :min="1"
            :max="365"
          />
        </el-form-item>
        <el-form-item label="日志保存天数">
          <el-input-number
            v-model="settings.logRetentionDays"
            :min="1"
            :max="365"
          />
        </el-form-item>
        <el-form-item label="数据压缩">
          <el-switch
            v-model="settings.enableCompression"
            active-text="启用"
            inactive-text="禁用"
          />
        </el-form-item>
        <el-form-item label="自动备份">
          <el-switch
            v-model="settings.enableAutoBackup"
            active-text="启用"
            inactive-text="禁用"
          />
        </el-form-item>
        <el-form-item label="备份时间">
          <el-time-picker
            v-model="settings.backupTime"
            format="HH:mm"
            placeholder="选择时间"
            :disabled="!settings.enableAutoBackup"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="settingsVisible = false">取消</el-button>
          <el-button type="primary" @click="saveSettings">
            保存
          </el-button>
        </span>
      </template>
    </el-dialog>
  </el-container>
</template>

<script lang="ts">
import { defineComponent, ref, shallowRef, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { Monitor, DataLine, Operation, Setting } from '@element-plus/icons-vue';
import { ipcRenderer } from 'electron';
import MonitorView from './MonitorView.vue';
import DataVisualization from '../components/DataVisualization.vue';
import SystemMonitor from '../components/SystemMonitor.vue';
import ConfigView from './ConfigView.vue';

export default defineComponent({
  name: 'MainView',

  components: {
    Monitor,
    DataLine,
    Operation,
    Setting,
    MonitorView,
    DataVisualization,
    SystemMonitor,
    ConfigView
  },

  setup() {
    const router = useRouter();
    const activeMenu = ref('monitor');
    const currentComponent = shallowRef(MonitorView);
    const isRunning = ref(false);
    const settingsVisible = ref(false);
    const settings = ref({
      dataRetentionDays: 30,
      logRetentionDays: 30,
      enableCompression: true,
      enableAutoBackup: true,
      backupTime: new Date(2024, 0, 1, 2, 0) // 默认凌晨2点
    });

    // 切换菜单
    const handleMenuSelect = (key: string) => {
      activeMenu.value = key;
      switch (key) {
        case 'monitor':
          currentComponent.value = MonitorView;
          break;
        case 'data':
          currentComponent.value = DataVisualization;
          break;
        case 'system':
          currentComponent.value = SystemMonitor;
          break;
        case 'config':
          currentComponent.value = ConfigView;
          break;
      }
    };

    // 切换服务状态
    const toggleService = async () => {
      try {
        if (isRunning.value) {
          await ipcRenderer.invoke('stop-service');
          isRunning.value = false;
          ElMessage.success('服务已停止');
        } else {
          await ipcRenderer.invoke('start-service');
          isRunning.value = true;
          ElMessage.success('服务已启动');
        }
      } catch (error) {
        ElMessage.error('操作失败：' + error.message);
      }
    };

    // 显示设置
    const showSettings = async () => {
      try {
        const config = await ipcRenderer.invoke('get-settings');
        settings.value = {
          ...settings.value,
          ...config
        };
        settingsVisible.value = true;
      } catch (error) {
        ElMessage.error('获取设置失败：' + error.message);
      }
    };

    // 保存设置
    const saveSettings = async () => {
      try {
        await ipcRenderer.invoke('save-settings', settings.value);
        settingsVisible.value = false;
        ElMessage.success('设置已保存');
      } catch (error) {
        ElMessage.error('保存设置失败：' + error.message);
      }
    };

    onMounted(async () => {
      try {
        const status = await ipcRenderer.invoke('get-service-status');
        isRunning.value = status.running;
      } catch (error) {
        ElMessage.error('获取服务状态失败：' + error.message);
      }
    });

    return {
      activeMenu,
      currentComponent,
      isRunning,
      settingsVisible,
      settings,
      handleMenuSelect,
      toggleService,
      showSettings,
      saveSettings
    };
  }
});
</script>

<style scoped>
.main-container {
  height: 100vh;
}

.main-menu {
  height: 100%;
  border-right: none;
}

.el-header {
  background-color: #fff;
  border-bottom: 1px solid #dcdfe6;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
}

.header-left h2 {
  margin: 0;
  color: #303133;
}

.el-main {
  background-color: #f5f7fa;
  padding: 20px;
}

.el-footer {
  background-color: #fff;
  border-top: 1px solid #dcdfe6;
}

.footer-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 100%;
  padding: 0 20px;
  color: #909399;
}

:deep(.el-menu-item) {
  display: flex;
  align-items: center;
}

:deep(.el-menu-item .el-icon) {
  margin-right: 8px;
}
</style>`
