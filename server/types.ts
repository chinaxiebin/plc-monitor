export type TagType = 'D' | 'X' | 'Y';
export type TagValue = boolean | number;

export interface TagConfig {
    address: number;
    type: TagType;
    refreshRate?: number;
    length?: number;
    description?: string;
    name?: string;
}

export interface PLCConfig {
    ip: string;
    port?: number;
    simulation?: boolean;
}

export interface TagGroup {
    type: TagType;
    startAddress: number;
    length: number;
    refreshRate: number;
    tags: string[];
}
