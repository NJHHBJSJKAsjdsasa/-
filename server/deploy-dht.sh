#!/bin/bash
# DHT WebSocket Bridge 部署脚本
# 部署到 49.232.170.26:7070

set -e

# 配置
SERVER_IP="49.232.170.26"
SERVER_USER="root"
SERVER_PORT="22"
REMOTE_DIR="/opt/dht-bootstrap"
SERVICE_NAME="dht-bridge"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  DHT WebSocket Bridge 部署脚本${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# 检查必要的文件
echo -e "${YELLOW}检查本地文件...${NC}"
if [ ! -f "dht-websocket-bridge.js" ]; then
    echo -e "${RED}错误: dht-websocket-bridge.js 不存在${NC}"
    exit 1
fi

if [ ! -f "package.json" ]; then
    echo -e "${RED}错误: package.json 不存在${NC}"
    exit 1
fi

echo -e "${GREEN}文件检查通过${NC}"
echo ""

# 创建远程目录
echo -e "${YELLOW}创建远程目录...${NC}"
ssh -p $SERVER_PORT $SERVER_USER@$SERVER_IP "mkdir -p $REMOTE_DIR"
echo -e "${GREEN}远程目录创建成功${NC}"
echo ""

# 上传文件
echo -e "${YELLOW}上传文件到服务器...${NC}"
scp -P $SERVER_PORT dht-websocket-bridge.js package.json $SERVER_USER@$SERVER_IP:$REMOTE_DIR/
echo -e "${GREEN}文件上传成功${NC}"
echo ""

# 在服务器上安装依赖并启动
echo -e "${YELLOW}在服务器上安装依赖...${NC}"
ssh -p $SERVER_PORT $SERVER_USER@$SERVER_IP << EOF
    cd $REMOTE_DIR
    
    # 检查是否安装了 Node.js
    if ! command -v node &> /dev/null; then
        echo "安装 Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    fi
    
    # 安装依赖
    npm install
    
    # 创建 systemd 服务文件
    cat > /etc/systemd/system/$SERVICE_NAME.service << EOL
[Unit]
Description=DHT WebSocket Bridge
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$REMOTE_DIR
ExecStart=/usr/bin/node dht-websocket-bridge.js
Restart=always
RestartSec=10
Environment="DHT_WS_PORT=7070"
Environment="DHT_PORT=7071"
Environment="DHT_LOG_LEVEL=info"

[Install]
WantedBy=multi-user.target
EOL
    
    # 重新加载 systemd
    systemctl daemon-reload
    
    # 启用服务
    systemctl enable $SERVICE_NAME
    
    # 停止旧服务（如果存在）
    systemctl stop $SERVICE_NAME 2>/dev/null || true
    
    # 启动服务
    systemctl start $SERVICE_NAME
    
    # 等待服务启动
    sleep 3
    
    # 检查服务状态
    systemctl status $SERVICE_NAME --no-pager
EOF

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  部署完成!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "服务信息:"
echo "  - WebSocket 端口: 7070"
echo "  - DHT UDP 端口: 7071"
echo "  - 健康检查: http://$SERVER_IP:7070/health"
echo "  - WebSocket: ws://$SERVER_IP:7070/dht"
echo ""
echo "管理命令:"
echo "  查看状态: systemctl status $SERVICE_NAME"
echo "  查看日志: journalctl -u $SERVICE_NAME -f"
echo "  重启服务: systemctl restart $SERVICE_NAME"
echo "  停止服务: systemctl stop $SERVICE_NAME"
echo ""
