/**
 * 全球P2P连接功能测试
 * 测试网络管理器、DHT管理器和P2P连接的功能
 */

// 模拟浏览器环境
if (typeof window === 'undefined') {
  global.window = { location: { host: 'localhost:8080' } };
  global.crypto = require('crypto');
  global.atob = (str) => Buffer.from(str, 'base64').toString('binary');
  global.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
  // 模拟RTCPeerConnection
  global.RTCPeerConnection = class {
    constructor() {
      this.connectionState = 'new';
      this.iceConnectionState = 'new';
      this.signalingState = 'stable';
    }
    close() {}
    createDataChannel() { return { readyState: 'closed' }; }
  };
}

// 导入测试模块
const fs = require('fs');
const path = require('path');

// 读取并执行相关文件
function loadFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  eval(content);
}

// 加载核心模块
loadFile(path.join(__dirname, 'html/js/dht-manager.js'));
loadFile(path.join(__dirname, 'html/js/network.js'));
loadFile(path.join(__dirname, 'html/js/webrtc.js'));

// 测试网络管理器
async function testNetworkManager() {
  console.log('=== 测试网络管理器 ===');
  
  try {
    const networkManager = new NetworkManager({
      signalingUrl: 'ws://49.232.170.26:5050',
      signalNodes: [
        'ws://us-bootstrap.p2p修仙游戏.com:5050',
        'ws://eu-bootstrap.p2p修仙游戏.com:5050',
        'ws://asia-bootstrap.p2p修仙游戏.com:5050',
        'ws://49.232.170.26:5050'
      ]
    });
    
    console.log('✓ 网络管理器初始化成功');
    console.log('  配置的信令节点:', networkManager.config.signalNodes.length);
    
    // 测试节点延迟测试
    console.log('\n测试节点延迟...');
    const testNodes = [
      'ws://49.232.170.26:5050',
      'ws://echo.websocket.org'
    ];
    
    for (const node of testNodes) {
      try {
        const latency = await networkManager.testNodeLatency(node);
        console.log(`  ${node}: ${latency > 0 ? latency + 'ms' : '不可用'}`);
      } catch (error) {
        console.log(`  ${node}: 错误 - ${error.message}`);
      }
    }
    
    // 测试智能节点选择
    console.log('\n测试智能节点选择...');
    try {
      const bestNode = await networkManager.selectBestNode();
      console.log('  最佳节点:', bestNode);
    } catch (error) {
      console.log('  节点选择失败:', error.message);
    }
    
    console.log('\n✓ 网络管理器测试完成');
  } catch (error) {
    console.error('✗ 网络管理器测试失败:', error);
  }
}

// 测试DHT管理器
async function testDHTManager() {
  console.log('\n=== 测试DHT管理器 ===');
  
  try {
    const dhtManager = new DHTManager({
      bootstrapNodes: [
        { url: 'ws://49.232.170.26:5050/dht', nodeId: null },
        { url: 'ws://us-bootstrap.p2p修仙游戏.com:5050/dht', nodeId: null }
      ]
    });
    
    console.log('✓ DHT管理器初始化成功');
    console.log('  配置的引导节点:', dhtManager.config.bootstrapNodes.length);
    
    // 测试密钥生成
    await dhtManager.loadOrGenerateKeyPair();
    console.log('  公钥:', dhtManager.publicKeyBase64.substring(0, 32) + '...');
    console.log('  节点ID:', dhtManager.nodeId.toHex().substring(0, 32) + '...');
    
    // 测试路由表
    console.log('  路由表初始化:', dhtManager.routingTable ? '成功' : '失败');
    
    console.log('\n✓ DHT管理器测试完成');
  } catch (error) {
    console.error('✗ DHT管理器测试失败:', error);
  }
}

// 测试P2P连接
function testP2PConnection() {
  console.log('\n=== 测试P2P连接 ===');
  
  try {
    const p2pConnection = new P2PConnection({
      peerId: 'test-peer-1',
      targetPeerId: 'test-peer-2',
      isInitiator: true
    });
    
    console.log('✓ P2P连接初始化成功');
    console.log('  配置:', {
      peerId: p2pConnection.config.peerId,
      targetPeerId: p2pConnection.config.targetPeerId,
      isInitiator: p2pConnection.config.isInitiator,
      iceServers: p2pConnection.config.iceServers.length
    });
    
    // 测试连接创建
    const created = p2pConnection.createPeerConnection();
    console.log('  连接创建:', created ? '成功' : '失败');
    
    console.log('\n✓ P2P连接测试完成');
  } catch (error) {
    console.error('✗ P2P连接测试失败:', error);
  }
}

// 运行所有测试
async function runAllTests() {
  console.log('开始测试全球P2P连接功能...\n');
  
  await testNetworkManager();
  await testDHTManager();
  testP2PConnection();
  
  console.log('\n所有测试完成！');
}

// 执行测试
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runAllTests };
} else {
  runAllTests();
}
