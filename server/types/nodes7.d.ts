declare module 'nodes7' {
    interface ConnectionOptions {
        port: number;
        host: string;
        rack: number;
        slot: number;
    }

    interface Nodes7Instance {
        initiateConnection(options: ConnectionOptions, callback: (err: Error | null) => void): void;
        addItems(name: string): void;
        readAllItems(callback: (err: Error | null, values: { [key: string]: any }) => void): void;
        writeItems(itemName: string, value: any, callback: (err: Error | null) => void): void;
        dropConnection(): void;
    }

    class Nodes7 implements Nodes7Instance {
        constructor();
        initiateConnection(options: ConnectionOptions, callback: (err: Error | null) => void): void;
        addItems(name: string): void;
        readAllItems(callback: (err: Error | null, values: { [key: string]: any }) => void): void;
        writeItems(itemName: string, value: any, callback: (err: Error | null) => void): void;
        dropConnection(): void;
    }

    export = Nodes7;
}
