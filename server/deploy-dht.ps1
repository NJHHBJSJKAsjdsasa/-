# DHT WebSocket Bridge 部署脚本 (PowerShell)
# 部署到 49.232.170.26:7070

$SERVER_IP = "49.232.170.26"
$SERVER_USER = "root"
$SERVER_PORT = "22"
$REMOTE_DIR = "/opt/dht-bootstrap"
$SERVICE_NAME = "dht-bridge"

Write-Host "========================================" -ForegroundColor Green
Write-Host "  DHT WebSocket Bridge 部署脚本" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# 检查必要的文件
Write-Host "检查本地文件..." -ForegroundColor Yellow
if (-not (Test-Path "dht-websocket-bridge.js")) {
    Write-Host "错误: dht-websocket-bridge.js 不存在" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "package.json")) {
    Write-Host "错误: package.json 不存在" -ForegroundColor Red
    exit 1
}

Write-Host "文件检查通过" -ForegroundColor Green
Write-Host ""

# 创建远程目录
Write-Host "创建远程目录..." -ForegroundColor Yellow
ssh -p $SERVER_PORT "${SERVER_USER}@${SERVER_IP}" "mkdir -p $REMOTE_DIR"
Write-Host "远程目录创建成功" -ForegroundColor Green
Write-Host ""

# 上传文件
Write-Host "上传文件到服务器..." -ForegroundColor Yellow
scp -P $SERVER_PORT "dht-websocket-bridge.js" "package.json" "${SERVER_USER}@${SERVER_IP}:${REMOTE_DIR}/"
Write-Host "文件上传成功" -ForegroundColor Green
Write-Host ""

# 在服务器上安装依赖并启动
Write-Host "在服务器上安装依赖并启动服务..." -ForegroundColor Yellow
$remoteScript = @"
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
cat > /etc/systemd/system/$SERVICE_NAME.service << 'EOF'
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
EOF

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
"@

ssh -p $SERVER_PORT "${SERVER_USER}@${SERVER_IP}" $remoteScript

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  部署完成!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "服务信息:"
Write-Host "  - WebSocket 端口: 7070"
Write-Host "  - DHT UDP 端口: 7071"
Write-Host "  - 健康检查: http://${SERVER_IP}:7070/health"
Write-Host "  - WebSocket: ws://${SERVER_IP}:7070/dht"
Write-Host ""
Write-Host "管理命令:"
Write-Host "  查看状态: systemctl status $SERVICE_NAME"
Write-Host "  查看日志: journalctl -u $SERVICE_NAME -f"
Write-Host "  重启服务: systemctl restart $SERVICE_NAME"
Write-Host "  停止服务: systemctl stop $SERVICE_NAME"
Write-Host ""
