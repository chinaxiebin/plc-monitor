import { TagConfig } from './types';

export const PLCTags: { [key: string]: TagConfig } = {
    // X区变量（输入，布尔类型）
    'emergencyStop': { 
        address: 0,            // X0
        type: 'X',
        refreshRate: 100,      // 100ms刷新
        description: '紧急停止按钮'
    },
    'sensorStatus1': { 
        address: 1,            // X1
        type: 'X',
        refreshRate: 100,
        description: '传感器1'
    },
    'sensorStatus2': { 
        address: 2,            // X2
        type: 'X',
        refreshRate: 100,
        description: '传感器2'
    },
    'sensorStatus3': { 
        address: 3,            // X3
        type: 'X',
        refreshRate: 100,
        description: '传感器3'
    },
    'sensorStatus4': { 
        address: 4,            // X4
        type: 'X',
        refreshRate: 100,
        description: '传感器4'
    },
    'sensorStatus5': { 
        address: 5,            // X5
        type: 'X',
        refreshRate: 100,
        description: '传感器5'
    },
    'sensorStatus6': { 
        address: 6,            // X6
        type: 'X',
        refreshRate: 100,
        description: '传感器6'
    },
    'sensorStatus7': { 
        address: 7,            // X7
        type: 'X',
        refreshRate: 100,
        description: '传感器7'
    },

    // Y区变量（输出，布尔类型）
    'output1': {
        address: 0,            // Y0
        type: 'Y',
        refreshRate: 100,
        description: '输出1'
    },
    'output2': {
        address: 1,            // Y1
        type: 'Y',
        refreshRate: 100,
        description: '输出2'
    },
    'output3': {
        address: 2,            // Y2
        type: 'Y',
        refreshRate: 100,
        description: '输出3'
    },
    'output4': {
        address: 3,            // Y3
        type: 'Y',
        refreshRate: 100,
        description: '输出4'
    },
    'output5': {
        address: 4,            // Y4
        type: 'Y',
        refreshRate: 100,
        description: '输出5'
    },
    'output6': {
        address: 5,            // Y5
        type: 'Y',
        refreshRate: 100,
        description: '输出6'
    },
    'output7': {
        address: 6,            // Y6
        type: 'Y',
        refreshRate: 100,
        description: '输出7'
    },
    'output8': {
        address: 7,            // Y7
        type: 'Y',
        refreshRate: 100,
        description: '输出8'
    },

    // D区变量（数据区，16位整数）
    'data1': {
        address: 0,            // D0
        type: 'D',
        refreshRate: 100,
        description: '数据1'
    },
    'data2': {
        address: 1,            // D1
        type: 'D',
        refreshRate: 100,
        description: '数据2'
    },
    'data3': {
        address: 2,            // D2
        type: 'D',
        refreshRate: 100,
        description: '数据3'
    },
    'data4': {
        address: 3,            // D3
        type: 'D',
        refreshRate: 100,
        description: '数据4'
    }
};
