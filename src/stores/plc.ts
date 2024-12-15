import { defineStore } from 'pinia'

interface PLCState {
  connected: boolean
  digitalInputs: { [key: string]: boolean }
  digitalOutputs: { [key: string]: boolean }
  commQuality: number
  errorCount: number
}

export const usePLCStore = defineStore('plc', {
  state: (): PLCState => ({
    connected: false,
    digitalInputs: {},
    digitalOutputs: {},
    commQuality: 100,
    errorCount: 0
  }),
  
  actions: {
    setConnection(status: boolean) {
      this.connected = status
    },
    
    updateInputs(inputs: { [key: string]: boolean }) {
      this.digitalInputs = inputs
    },
    
    updateOutputs(outputs: { [key: string]: boolean }) {
      this.digitalOutputs = outputs
    },
    
    updateCommStatus(quality: number, errors: number) {
      this.commQuality = quality
      this.errorCount = errors
    }
  }
})
