import { TagConfig } from './types';

export const PLCTags: { [key: string]: TagConfig } = {
    // 数字量输入（DI - Digital Input）
    'emergencyStop': { 
        address: 0,            // X0
        type: 'DI',
        refreshRate: 100,      // 100ms刷新
        description: '紧急停止按钮'
    },
    'sensorStatus1': { 
        address: 1,            // X1
        type: 'DI',
        refreshRate: 100,
        description: '传感器1'
    },
    'sensorStatus2': { 
        address: 2,            // X2
        type: 'DI',
        refreshRate: 100,
        description: '传感器2'
    },
    'sensorStatus3': { 
        address: 3,            // X3
        type: 'DI',
        refreshRate: 100,
        description: '传感器3'
    },
    'sensorStatus4': { 
        address: 4,            // X4
        type: 'DI',
        refreshRate: 100,
        description: '传感器4'
    },
    'sensorStatus5': { 
        address: 5,            // X5
        type: 'DI',
        refreshRate: 100,
        description: '传感器5'
    },
    'sensorStatus6': { 
        address: 6,            // X6
        type: 'DI',
        refreshRate: 100,
        description: '传感器6'
    },
    'sensorStatus7': { 
        address: 7,            // X7
        type: 'DI',
        refreshRate: 100,
        description: '传感器7'
    },

    // Y区变量（输出，布尔类型）
    'output1': {
        address: 0,            // Y0
        type: 'DO',
        refreshRate: 100,
        description: '输出1'
    },
    'output2': {
        address: 1,            // Y1
        type: 'DO',
        refreshRate: 100,
        description: '输出2'
    },
    'output3': {
        address: 2,            // Y2
        type: 'DO',
        refreshRate: 100,
        description: '输出3'
    },
    'output4': {
        address: 3,            // Y3
        type: 'DO',
        refreshRate: 100,
        description: '输出4'
    },
    'output5': {
        address: 4,            // Y4
        type: 'DO',
        refreshRate: 100,
        description: '输出5'
    },
    'output6': {
        address: 5,            // Y5
        type: 'DO',
        refreshRate: 100,
        description: '输出6'
    },
    'output7': {
        address: 6,            // Y6
        type: 'DO',
        refreshRate: 100,
        description: '输出7'
    },
    'output8': {
        address: 7,            // Y7
        type: 'DO',
        refreshRate: 100,
        description: '输出8'
    },

    // D区变量（模拟量，数值类型）
    'temperature1': {
        address: 0,            // D0
        type: 'REG',
        refreshRate: 1000,     // 1秒刷新
        description: '温度传感器1',
        unit: '°C',
        minValue: 0,
        maxValue: 100,
        scale: 0.1             // 实际值 = 寄存器值 * 0.1
    },
    'pressure1': {
        address: 1,            // D1
        type: 'REG',
        refreshRate: 1000,
        description: '压力传感器1',
        unit: 'MPa',
        minValue: 0,
        maxValue: 10,
        scale: 0.01            // 实际值 = 寄存器值 * 0.01
    },
    'flowRate1': {
        address: 2,            // D2
        type: 'REG',
        refreshRate: 1000,
        description: '流量计1',
        unit: 'm³/h',
        minValue: 0,
        maxValue: 1000,
        scale: 0.1             // 实际值 = 寄存器值 * 0.1
    },
    'level1': {
        address: 3,            // D3
        type: 'REG',
        refreshRate: 1000,
        description: '液位计1',
        unit: 'm',
        minValue: 0,
        maxValue: 10,
        scale: 0.01            // 实际值 = 寄存器值 * 0.01
    }
};
