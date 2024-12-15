import { ref } from 'vue'
import { io, Socket } from 'socket.io-client'

interface WebSocketOptions {
  onConnect?: () => void
  onDisconnect?: () => void
  onData?: (data: any) => void
}

export function useWebSocket(options: WebSocketOptions = {}) {
  const socket = ref<Socket | null>(null)
  
  const connect = () => {
    socket.value = io('ws://localhost:3001', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity
    })
    
    socket.value.on('connect', () => {
      console.log('WebSocket connected')
      options.onConnect?.()
    })
    
    socket.value.on('disconnect', () => {
      console.log('WebSocket disconnected')
      options.onDisconnect?.()
    })
    
    socket.value.on('plcData', (data) => {
      console.log('Received PLC data:', data)
      options.onData?.(data)
    })
  }
  
  const disconnect = () => {
    if (socket.value) {
      socket.value.disconnect()
      socket.value = null
    }
  }
  
  const sendMessage = (event: string, data?: any) => {
    if (socket.value) {
      socket.value.emit(event, data)
    }
  }
  
  return {
    connect,
    disconnect,
    sendMessage
  }
}
