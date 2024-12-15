import { io, Socket } from 'socket.io-client';
import { ref } from 'vue';
import { usePLCStore } from '../stores/plc';

const socket = ref<Socket | null>(null);
const isConnected = ref(false);

export function usePLCSocket() {
  const plcStore = usePLCStore();

  const connect = () => {
    if (!socket.value) {
      socket.value = io('http://localhost:3000');

      socket.value.on('connect', () => {
        isConnected.value = true;
        plcStore.setConnection(true);
      });

      socket.value.on('disconnect', () => {
        isConnected.value = false;
        plcStore.setConnection(false);
      });

      socket.value.on('plc-data', (data: any) => {
        // 更新数字量输入状态
        const inputs: { [key: string]: boolean } = {};
        const outputs: { [key: string]: boolean } = {};

        for (let i = 0; i < 8; i++) {
          inputs[`X${i}`] = data[`X${i}`];
          outputs[`Y${i}`] = data[`Y${i}`];
        }

        plcStore.updateInputs(inputs);
        plcStore.updateOutputs(outputs);
      });
    }
  };

  const disconnect = () => {
    if (socket.value) {
      socket.value.disconnect();
      socket.value = null;
    }
  };

  const writePLC = async (name: string, value: any) => {
    return new Promise((resolve, reject) => {
      if (!socket.value || !isConnected.value) {
        reject(new Error('Not connected to server'));
        return;
      }

      socket.value.emit('write-plc', { name, value });
      
      socket.value.once('write-success', (response) => {
        resolve(response);
      });

      socket.value.once('write-error', (error) => {
        reject(error);
      });
    });
  };

  return {
    connect,
    disconnect,
    writePLC,
    isConnected
  };
}
