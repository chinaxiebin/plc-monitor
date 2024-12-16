<template>
  <div class="dashboard">
    <el-container>
      <el-header>
        <div class="header-content">
          <h2>AM521 监控</h2>
          <div class="header-right">
            <router-link to="/config" class="config-link">
              <el-button type="primary" plain>系统配置</el-button>
            </router-link>
            <div class="connection-status" :class="{ connected: isConnected }">
              {{ isConnected ? '已连接' : '未连接' }}
            </div>
          </div>
        </div>
      </el-header>
      
      <el-container>
        <el-aside width="300px">
          <plc-list />
        </el-aside>
        <el-main>
          <el-tabs v-model="activeTab">
            <el-tab-pane label="数字量监控" name="digital">
              <digital-monitor />
            </el-tab-pane>
            <el-tab-pane label="模拟量输入" name="analogIn">
              <analog-monitor />
            </el-tab-pane>
            <el-tab-pane label="模拟量输出" name="analogOut">
              <AnalogOutputMonitor />
            </el-tab-pane>
            <el-tab-pane label="数据寄存器" name="register">
              <RegisterMonitor />
            </el-tab-pane>
            <el-tab-pane label="报警监控" name="alarm">
              <AlarmMonitor />
            </el-tab-pane>
            <el-tab-pane label="配置管理" name="config">
              <ConfigManager />
            </el-tab-pane>
          </el-tabs>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { usePLCStore } from '../stores/plc'
import { usePLCSocket } from '../composables/usePLCSocket'
import AlarmMonitor from '@/components/AlarmMonitor.vue';
import AnalogOutputMonitor from '@/components/AnalogOutputMonitor.vue';
import RegisterMonitor from '@/components/RegisterMonitor.vue';
import ConfigManager from '@/components/ConfigManager.vue';

const plcStore = usePLCStore()
const { connected: isConnected, digitalInputs, digitalOutputs } = storeToRefs(plcStore)
const { connect, disconnect, writePLC } = usePLCSocket()

// 通信状态数据
const plcAddress = ref('192.168.1.100')
const refreshRate = ref(100)
const onlineTime = ref('00:00:00')
const commQuality = ref(100)
const errorCount = ref(0)

// 刷新连接
const refreshConnection = async () => {
  disconnect()
  connect()
}

// 处理输出点击
const handleOutputClick = async (output: string) => {
  try {
    const currentValue = digitalOutputs.value[output]
    await writePLC(output, !currentValue)
  } catch (error) {
    console.error('Failed to write to PLC:', error)
  }
}

// 生命周期钩子
onMounted(() => {
  connect()
})

onUnmounted(() => {
  disconnect()
})

const activeTab = ref('digital')
</script>

<style scoped lang="scss">
.dashboard {
  min-height: 100vh;
  background: #f0f2f5;
  
  .el-header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: #fff;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.12);
    padding: 0;
    
    .header-content {
      height: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 15px;
      
      h2 {
        margin: 0;
        font-size: 18px;
      }
    }
    
    .header-right {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    
    .connection-status {
      padding: 4px 8px;
      border-radius: 4px;
      background: #f56c6c;
      color: #fff;
      font-size: 14px;
      
      &.connected {
        background: #67c23a;
      }
    }
  }
  
  .el-main {
    padding: 15px;
    
    .el-card {
      margin-bottom: 15px;
      border-radius: 8px;
      
      &:last-child {
        margin-bottom: 0;
      }
    }
  }
  
  .io-panel {
    .io-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      padding: 10px;
      
      @media screen and (max-width: 768px) {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    
    .io-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 10px;
      border: 1px solid #eee;
      border-radius: 8px;
      background: #fff;
      
      .io-indicator {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #dcdfe6;
        margin-bottom: 5px;
        transition: all 0.3s;
        
        &.active {
          background: #67c23a;
          box-shadow: 0 0 10px rgba(103, 194, 58, 0.5);
        }
      }
      
      .io-label {
        font-weight: bold;
        margin-bottom: 3px;
        font-size: 16px;
      }
      
      .io-value {
        font-size: 14px;
        color: #909399;
      }
    }
  }
  
  .status-panel {
    .status-info {
      padding: 10px;
    }
    
    .status-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
      
      @media screen and (max-width: 768px) {
        grid-template-columns: 1fr;
      }
    }
    
    .status-item {
      padding: 10px;
      border: 1px solid #eee;
      border-radius: 8px;
      background: #fff;
      
      .label {
        color: #909399;
        font-size: 14px;
      }
      
      .value {
        display: block;
        margin-top: 5px;
        font-size: 16px;
        font-weight: bold;
        color: #303133;
      }
    }
  }
}

// 移动端适配
@media screen and (max-width: 768px) {
  .dashboard {
    .el-header {
      .header-content {
        h2 {
          font-size: 16px;
        }
      }
      
      .connection-status {
        font-size: 12px;
        padding: 3px 6px;
      }
    }
    
    .el-main {
      padding: 10px;
    }
    
    .io-panel {
      .io-item {
        padding: 8px;
        
        .io-indicator {
          width: 20px;
          height: 20px;
        }
        
        .io-label {
          font-size: 14px;
        }
        
        .io-value {
          font-size: 12px;
        }
      }
    }
    
    .status-panel {
      .status-item {
        .label {
          font-size: 12px;
        }
        
        .value {
          font-size: 14px;
        }
      }
    }
  }
}

.config-link {
  text-decoration: none;
}
</style>
