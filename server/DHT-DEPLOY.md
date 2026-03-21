# DHT 引导节点部署指南

## 概述

DHT WebSocket Bridge 是一个将浏览器 WebSocket 连接桥接到 DHT UDP 网络的服务，允许浏览器客户端参与 DHT 网络进行玩家发现和 WebRTC 信令传输。

## 架构

```
浏览器客户端 ←→ WebSocket ←→ DHT Bridge ←→ DHT UDP 网络
```

- **WebSocket 端口**: 7070 (TCP)
- **DHT UDP 端口**: 7071 (UDP)
- **服务器**: 49.232.170.26

## 文件说明

| 文件 | 说明 |
|------|------|
| `dht-websocket-bridge.js` | DHT WebSocket 桥接服务主程序 |
| `dht-bootstrap.js` | 纯 DHT 引导节点（UDP 直接访问） |
| `deploy-dht.ps1` | Windows PowerShell 部署脚本 |
| `deploy-dht.sh` | Linux/macOS Bash 部署脚本 |

## 部署步骤

### 方法一：使用 PowerShell 脚本（推荐 Windows 用户）

```powershell
cd d:\qkuailian\server
.\deploy-dht.ps1
```

### 方法二：使用 Bash 脚本（Linux/macOS）

```bash
cd /path/to/qkuailian/server
chmod +x deploy-dht.sh
./deploy-dht.sh
```

### 方法三：手动部署

1. **上传文件到服务器**

```bash
scp dht-websocket-bridge.js package.json root@49.232.170.26:/opt/dht-bootstrap/
```

2. **SSH 登录服务器并安装依赖**

```bash
ssh root@49.232.170.26
cd /opt/dht-bootstrap
npm install
```

3. **创建 systemd 服务**

```bash
cat > /etc/systemd/system/dht-bridge.service << 'EOF'
[Unit]
Description=DHT WebSocket Bridge
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/dht-bootstrap
ExecStart=/usr/bin/node dht-websocket-bridge.js
Restart=always
RestartSec=10
Environment="DHT_WS_PORT=7070"
Environment="DHT_PORT=7071"
Environment="DHT_LOG_LEVEL=info"

[Install]
WantedBy=multi-user.target
EOF
```

4. **启动服务**

```bash
systemctl daemon-reload
systemctl enable dht-bridge
systemctl start dht-bridge
systemctl status dht-bridge
```

## 验证部署

### 1. 检查服务状态

```bash
systemctl status dht-bridge
```

### 2. 查看日志

```bash
journalctl -u dht-bridge -f
```

### 3. 测试健康检查

```bash
curl http://49.232.170.26:7070/health
```

预期输出：
```json
{
  "status": "ok",
  "dhtReady": true,
  "clients": 0,
  "timestamp": 1234567890
}
```

### 4. 测试 WebSocket 连接

使用浏览器控制台：
```javascript
const ws = new WebSocket('ws://49.232.170.26:7070/dht');
ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log('Received:', JSON.parse(e.data));
ws.send(JSON.stringify({ type: 'ping', senderId: 'test', timestamp: Date.now() }));
```

## 防火墙配置

确保服务器防火墙允许以下端口：

```bash
# 开放 WebSocket TCP 端口
ufw allow 7070/tcp

# 开放 DHT UDP 端口
ufw allow 7071/udp

# 或者使用 iptables
iptables -A INPUT -p tcp --dport 7070 -j ACCEPT
iptables -A INPUT -p udp --dport 7071 -j ACCEPT
```

## 游戏客户端配置

游戏客户端已配置为连接到新的 DHT 引导节点：

```javascript
// html/js/game.js
dhtManager = new DHTManager({
  bootstrapNodes: [
    { url: 'ws://49.232.170.26:7070/dht', nodeId: null }
  ],
  // ...
});
```

## 管理命令

| 命令 | 说明 |
|------|------|
| `systemctl status dht-bridge` | 查看服务状态 |
| `systemctl start dht-bridge` | 启动服务 |
| `systemctl stop dht-bridge` | 停止服务 |
| `systemctl restart dht-bridge` | 重启服务 |
| `journalctl -u dht-bridge -f` | 查看实时日志 |
| `journalctl -u dht-bridge --since "1 hour ago"` | 查看最近1小时日志 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DHT_WS_PORT` | 7070 | WebSocket 监听端口 |
| `DHT_PORT` | 7071 | DHT UDP 端口 |
| `DHT_BOOTSTRAP` | false | 是否作为纯引导节点 |
| `DHT_LOG_LEVEL` | info | 日志级别 (debug/info/warn/error) |

## 故障排除

### 服务无法启动

1. 检查端口是否被占用：
```bash
netstat -tlnp | grep 7070
netstat -ulnp | grep 7071
```

2. 检查 Node.js 是否安装：
```bash
node --version
npm --version
```

3. 查看详细错误日志：
```bash
journalctl -u dht-bridge -n 100 --no-pager
```

### 客户端无法连接

1. 检查防火墙设置
2. 检查服务器安全组（如果是云服务器）
3. 测试网络连通性：
```bash
telnet 49.232.170.26 7070
```

### DHT 网络连接问题

1. 检查 DHT UDP 端口是否开放
2. 查看 DHT 日志中的节点连接情况
3. 尝试重启服务

## 更新部署

更新代码后重新部署：

```bash
# 1. 上传新文件
scp dht-websocket-bridge.js package.json root@49.232.170.26:/opt/dht-bootstrap/

# 2. 重启服务
ssh root@49.232.170.26 "systemctl restart dht-bridge"
```

## 安全建议

1. **使用防火墙**限制访问来源
2. **启用 HTTPS/WSS** 生产环境建议使用 SSL
3. **定期更新** Node.js 和依赖包
4. **监控日志** 及时发现异常行为

## 联系支持

如有问题，请检查日志或联系开发团队。
