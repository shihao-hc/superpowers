#!/bin/bash
# Minecraft Server Setup Script

echo "=========================================="
echo "  Minecraft 服务器安装脚本"
echo "=========================================="

MC_DIR="mc-server"
mkdir -p "$MC_DIR"
cd "$MC_DIR"

# Check Java
if ! command -v java &> /dev/null; then
    echo "❌ Java 未安装"
    echo "请从 https://adoptium.net/ 下载安装 Java 17+"
    exit 1
fi

JAVA_VERSION=$(java -version 2>&1 | head -1 | cut -d'"' -f2)
echo "✅ Java 版本: $JAVA_VERSION"

# Download Paper
PAPER_URL="https://api.papermc.io/v2/projects/paper/versions/1.20.4/builds/496/downloads/paper-1.20.4-496.jar"
PAPER_JAR="paper.jar"

if [ ! -f "$PAPER_JAR" ]; then
    echo "📥 下载 Paper 1.20.4..."
    curl -o "$PAPER_JAR" "$PAPER_URL"
else
    echo "✅ Paper 已存在"
fi

# Create start script
cat > start.sh << 'EOF'
#!/bin/bash
java -Xmx2G -Xms1G -jar paper.jar nogui
EOF
chmod +x start.sh

# Create Windows batch file
cat > start.bat << 'EOF'
@echo off
java -Xmx2G -Xms1G -jar paper.jar nogui
pause
EOF

echo ""
echo "=========================================="
echo "  服务器配置"
echo "=========================================="
echo ""
echo "1. 首次运行生成配置:"
echo "   bash start.sh  (Linux/Mac)"
echo "   start.bat      (Windows)"
echo ""
echo "2. 修改 eula.txt: eula=true"
echo ""
echo "3. 修改 server.properties:"
echo "   online-mode=false"
echo "   server-port=25565"
echo ""
echo "4. 重新启动服务器"
echo ""
echo "5. 在游戏中连接: localhost:25565"
echo ""
echo "=========================================="
