export type TagType = 'DI' | 'DO' | 'AI' | 'AO' | 'REG';
export type TagValue = boolean | number;

export interface TagConfig {
    address: number;
    type: TagType;
    refreshRate?: number;
    length?: number;
    description?: string;
    name?: string;
    // 模拟量配置
    unit?: string;
    minValue?: number;
    maxValue?: number;
    scale?: number;
    // 运行时状态
    value?: number;
    newValue?: number;
    parsedValue?: number;
    writing?: boolean;
    format?: 'DEC' | 'HEX' | 'BIN';
}
