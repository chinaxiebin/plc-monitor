#!/bin/bash

# 清理旧的打包文件
rm -f plc-monitor.tar.gz

# 创建临时目录
mkdir -p temp_package/plc-monitor

# 复制需要的文件
cp -r \
    public \
    server \
    src \
    package.json \
    package-lock.json \
    tsconfig.json \
    tsconfig.node.json \
    tsconfig.server.json \
    vite.config.ts \
    README.md \
    temp_package/plc-monitor/

# 打包
cd temp_package && tar -czf ../plc-monitor.tar.gz plc-monitor/

# 清理临时目录
cd .. && rm -rf temp_package

echo "打包完成：plc-monitor.tar.gz"
