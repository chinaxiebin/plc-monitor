import { defineStore } from 'pinia'
import io from 'socket.io-client'
import type { TagConfig } from '../types'

interface PLCState {
  connected: boolean
  digitalInputs: { [key: string]: boolean }
  digitalOutputs: { [key: string]: boolean }
  analogInputs: TagConfig[]
  analogOutputs: TagConfig[]
  registers: TagConfig[]
  commQuality: number
  errorCount: number
}

export const usePLCStore = defineStore('plc', {
  state: (): PLCState => ({
    connected: false,
    digitalInputs: {},
    digitalOutputs: {},
    analogInputs: [],
    analogOutputs: [],
    registers: [],
    commQuality: 100,
    errorCount: 0
  }),
  
  actions: {
    setConnection(status: boolean) {
      this.connected = status
    },
    
    updateDigitalInput(address: number, value: boolean) {
      this.digitalInputs[`DI${address}`] = value
    },
    
    updateDigitalOutput(address: number, value: boolean) {
      this.digitalOutputs[`DO${address}`] = value
    },
    
    updateAnalogInput(address: number, value: number) {
      const input = this.analogInputs.find(ai => ai.address === address)
      if (input) {
        input.value = value
      }
    },
    
    updateAnalogOutput(address: number, value: number) {
      const output = this.analogOutputs.find(ao => ao.address === address)
      if (output) {
        output.value = value
      }
    },
    
    updateRegister(address: number, value: number) {
      const register = this.registers.find(r => r.address === address)
      if (register) {
        register.value = value
      }
    },
    
    updateCommStatus(quality: number, errors: number) {
      this.commQuality = quality
      this.errorCount = errors
    },
    
    // 写入数字量输出
    async writeDigitalOutput(address: number, value: boolean) {
      try {
        const response = await fetch('/api/plc/digitalOutput', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, value })
        })
        if (!response.ok) throw new Error('写入失败')
      } catch (error) {
        console.error('写入数字量输出失败:', error)
        throw error
      }
    },
    
    // 写入模拟量输出
    async writeAnalogOutput(address: number, value: number) {
      try {
        const response = await fetch('/api/plc/analogOutput', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, value })
        })
        if (!response.ok) throw new Error('写入失败')
      } catch (error) {
        console.error('写入模拟量输出失败:', error)
        throw error
      }
    },
    
    // 写入数据寄存器
    async writeRegister(address: number, value: number) {
      try {
        const response = await fetch('/api/plc/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address, value })
        })
        if (!response.ok) throw new Error('写入失败')
      } catch (error) {
        console.error('写入数据寄存器失败:', error)
        throw error
      }
    },
    
    // 订阅更新
    subscribeAnalogOutputs() {
      const socket = io()
      socket.on('analogOutputUpdate', ({ address, value }) => {
        this.updateAnalogOutput(address, value)
      })
    },
    
    subscribeRegisters() {
      const socket = io()
      socket.on('registerUpdate', ({ address, value }) => {
        this.updateRegister(address, value)
      })
    },
    
    // 取消订阅
    unsubscribeAnalogOutputs() {
      const socket = io()
      socket.off('analogOutputUpdate')
    },
    
    unsubscribeRegisters() {
      const socket = io()
      socket.off('registerUpdate')
    }
  }
})
