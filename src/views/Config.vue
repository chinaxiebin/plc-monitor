<template>
  <div class="config-page">
    <nav class="navbar">
      <router-link to="/" class="nav-link">返回仪表盘</router-link>
      <h1>系统配置</h1>
    </nav>
    <config-manager />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import ConfigManager from '../components/ConfigManager.vue'

export default defineComponent({
  name: 'Config',
  components: {
    ConfigManager
  }
})
</script>

<style scoped>
.config-page {
  min-height: 100vh;
  background-color: #f5f5f5;
}

.navbar {
  background-color: #fff;
  padding: 1rem 2rem;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  display: flex;
  align-items: center;
  margin-bottom: 2rem;
}

.nav-link {
  text-decoration: none;
  color: #2196F3;
  font-weight: 500;
  margin-right: 2rem;
}

.nav-link:hover {
  color: #1976D2;
}

h1 {
  margin: 0;
  color: #2c3e50;
  font-size: 1.5rem;
}
</style>
