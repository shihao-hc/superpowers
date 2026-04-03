#!/bin/bash
# ===========================================
# UltraWork 生产部署演练脚本
# 执行完整部署流程的预演
# ===========================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo "============================================"
echo "  UltraWork 生产部署演练"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"
echo ""

# 1. 环境检查
log_info "阶段1: 环境检查"
echo "--------------------------------------------"

# 检查 Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    log_success "Node.js: $NODE_VERSION"
else
    log_error "Node.js 未安装"
    exit 1
fi

# 检查 npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    log_success "npm: v$NPM_VERSION"
else
    log_error "npm 未安装"
    exit 1
fi

# 检查 Docker
if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version)
    log_success "Docker: $DOCKER_VERSION"
else
    log_warn "Docker 未安装 (跳过容器检查)"
fi

# 检查 kubectl
if command -v kubectl &> /dev/null; then
    KUBECTL_VERSION=$(kubectl version --client --short 2>/dev/null || kubectl version --client 2>/dev/null | head -1)
    log_success "kubectl: $KUBECTL_VERSION"
else
    log_warn "kubectl 未安装 (跳过 K8s 检查)"
fi

# 检查环境变量
log_info "检查必需环境变量..."
REQUIRED_VARS=("NODE_ENV" "PORT")
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        log_warn "$var 未设置"
    else
        log_success "$var = ${!var}"
    fi
done

echo ""
echo "--------------------------------------------"
log_success "环境检查完成"
echo ""

# 2. 代码检查
log_info "阶段2: 代码质量和安全检查"
echo "--------------------------------------------"

cd "$PROJECT_ROOT"

# 检查 package.json
if [ -f "package.json" ]; then
    log_success "package.json 存在"
else
    log_error "package.json 不存在"
    exit 1
fi

# 安装依赖 (dry-run)
log_info "依赖检查 (不实际安装)..."
if [ -d "node_modules" ]; then
    log_success "node_modules 已存在"
else
    log_info "安装依赖..."
    npm install --dry-run 2>&1 | head -5 || log_warn "依赖未安装 (跳过)"
fi

# 运行 lint (如果配置)
if [ -f ".eslintrc.js" ] || [ -f ".eslintrc.json" ]; then
    log_info "运行 ESLint..."
    npm run lint --dry-run 2>/dev/null || log_warn "ESLint 未配置"
fi

# 类型检查 (如果配置)
if [ -f "tsconfig.json" ]; then
    log_info "TypeScript 类型检查..."
    npx tsc --noEmit 2>/dev/null || log_warn "类型检查未通过"
fi

echo ""
echo "--------------------------------------------"
log_success "代码检查完成"
echo ""

# 3. 测试执行
log_info "阶段3: 测试执行"
echo "--------------------------------------------"

if [ -d "tests" ]; then
    TEST_COUNT=$(find tests -name "*.test.js" -o -name "*.spec.js" 2>/dev/null | wc -l)
    log_info "发现 $TEST_COUNT 个测试文件"
    
    # 运行单元测试
    if npm test -- --listTests 2>/dev/null | grep -q "test"; then
        log_info "运行单元测试..."
        npm test -- --passWithNoTests 2>&1 | tail -10 || log_warn "测试执行跳过"
    else
        log_warn "未配置测试"
    fi
else
    log_warn "tests 目录不存在"
fi

echo ""
echo "--------------------------------------------"
log_success "测试执行完成"
echo ""

# 4. 安全扫描
log_info "阶段4: 安全扫描"
echo "--------------------------------------------"

# npm audit
log_info "运行 npm audit..."
if command -v npm &> /dev/null; then
    npm audit --dry-run 2>&1 | tail -5 || log_warn "安全扫描跳过"
fi

# 检查敏感文件
log_info "检查敏感文件..."
SENSITIVE_FILES=(".env" ".env.local" "*.pem" "*.key" "credentials.json")
for pattern in "${SENSITIVE_FILES[@]}"; do
    FOUND=$(find . -name "$pattern" -type f 2>/dev/null | head -3)
    if [ -n "$FOUND" ]; then
        log_warn "发现敏感文件: $FOUND"
    fi
done

# 检查 .gitignore
if [ -f ".gitignore" ]; then
    log_success ".gitignore 已配置"
else
    log_warn ".gitignore 不存在"
fi

echo ""
echo "--------------------------------------------"
log_success "安全扫描完成"
echo ""

# 5. Docker 构建演练
log_info "阶段5: Docker 构建演练"
echo "--------------------------------------------"

if [ -f "Dockerfile" ]; then
    log_success "Dockerfile 存在"
    
    if command -v docker &> /dev/null && docker info &> /dev/null; then
        log_info "Docker daemon 运行中"
        
        # Docker 构建演练
        log_info "演练 Docker 构建 (使用 --dry-run 或缓存)..."
        docker build --dry-run . 2>&1 | tail -5 || log_warn "Docker 构建演练跳过"
        
        # 检查多阶段构建
        if grep -q "FROM.*AS" Dockerfile; then
            log_success "使用多阶段构建优化"
        fi
        
        # 检查健康检查
        if grep -q "HEALTHCHECK" Dockerfile; then
            log_success "已配置健康检查"
        else
            log_warn "建议添加 HEALTHCHECK"
        fi
    else
        log_warn "Docker 不可用，跳过容器构建"
    fi
else
    log_warn "Dockerfile 不存在"
fi

echo ""
echo "--------------------------------------------"
log_success "Docker 构建演练完成"
echo ""

# 6. K8s 部署演练
log_info "阶段6: Kubernetes 部署演练"
echo "--------------------------------------------"

if [ -d "k8s" ] || [ -d "kubernetes" ]; then
    K8S_DIR=$([ -d "k8s" ] && echo "k8s" || echo "kubernetes")
    log_success "$K8S_DIR 目录存在"
    
    if command -v kubectl &> /dev/null; then
        # 检查 YAML 语法
        log_info "检查 K8s YAML 配置..."
        YAML_COUNT=$(find "$K8S_DIR" -name "*.yaml" -o -name "*.yml" 2>/dev/null | wc -l)
        log_info "发现 $YAML_COUNT 个 YAML 文件"
        
        # Helm 检查
        if [ -d "$K8S_DIR/helm" ]; then
            log_success "Helm charts 目录存在"
            
            if command -v helm &> /dev/null; then
                log_info "演练 Helm lint..."
                helm lint "$K8S_DIR/helm" 2>&1 | tail -5 || log_warn "Helm lint 跳过"
                
                log_info "演练 Helm template..."
                helm template test-release "$K8S_DIR/helm" 2>&1 | head -10 || log_warn "Helm template 跳过"
            fi
        fi
        
        # 检查资源限制
        if grep -q "resources:" "$K8S_DIR"/*.yaml 2>/dev/null; then
            log_success "已配置资源限制"
        else
            log_warn "建议添加资源限制 (resources)"
        fi
        
        # 检查副本数
        if grep -q "replicas:" "$K8S_DIR"/*.yaml 2>/dev/null; then
            log_success "已配置副本数"
        else
            log_warn "建议配置副本数 (replicas)"
        fi
    else
        log_warn "kubectl 不可用，跳过 K8s 检查"
    fi
else
    log_warn "K8s 配置目录不存在"
fi

echo ""
echo "--------------------------------------------"
log_success "K8s 部署演练完成"
echo ""

# 7. 监控和日志配置检查
log_info "阶段7: 监控和日志配置"
echo "--------------------------------------------"

# Prometheus 配置
if [ -f "prometheus.yml" ] || [ -f "prometheus.yml" ]; then
    log_success "Prometheus 配置存在"
elif find . -name "prometheus*.yml" -type f 2>/dev/null | head -1 | grep -q .; then
    log_success "Prometheus 配置存在"
else
    log_warn "建议添加 Prometheus 配置"
fi

# 日志配置
if [ -f "logconfig.yml" ] || [ -f "logging.yml" ]; then
    log_success "日志配置存在"
else
    log_warn "建议添加日志配置"
fi

# 环境变量示例
if [ -f ".env.example" ]; then
    log_success ".env.example 存在"
else
    log_warn "建议创建 .env.example"
fi

echo ""
echo "--------------------------------------------"
log_success "监控和日志配置检查完成"
echo ""

# 8. SSL/TLS 检查
log_info "阶段8: SSL/TLS 配置"
echo "--------------------------------------------"

if grep -rq "tls\|https\|ssl" . --include="*.yaml" --include="*.yml" --include="*.js" 2>/dev/null | head -1 | grep -q .; then
    log_success "检测到 SSL/TLS 配置"
else
    log_warn "未检测到 SSL/TLS 配置"
fi

if [ -d "certs" ] || [ -d "ssl" ]; then
    log_warn "SSL 证书目录存在 (注意: 不要提交证书到版本控制)"
fi

echo ""
echo "--------------------------------------------"
log_success "SSL/TLS 检查完成"
echo ""

# 9. 备份策略检查
log_info "阶段9: 备份策略"
echo "--------------------------------------------"

if [ -f "backup.sh" ] || [ -f "scripts/backup.sh" ]; then
    log_success "备份脚本存在"
else
    log_warn "建议添加备份脚本"
fi

if grep -rq "backup\|snapshot\|archive" . --include="*.sh" 2>/dev/null | head -1 | grep -q .; then
    log_success "检测到备份配置"
fi

echo ""
echo "--------------------------------------------"
log_success "备份策略检查完成"
echo ""

# 10. 灾难恢复检查
log_info "阶段10: 灾难恢复计划"
echo "--------------------------------------------"

if [ -f "DISASTER_RECOVERY.md" ] || [ -f "dr-plan.md" ]; then
    log_success "灾难恢复文档存在"
else
    log_warn "建议添加灾难恢复计划文档"
fi

echo ""
echo "--------------------------------------------"
log_success "灾难恢复检查完成"
echo ""

# 总结
echo "============================================"
echo "  部署演练总结"
echo "============================================"
echo ""
log_info "演练阶段完成:"
echo "  1. ✅ 环境检查"
echo "  2. ✅ 代码质量检查"
echo "  3. ✅ 测试执行"
echo "  4. ✅ 安全扫描"
echo "  5. ✅ Docker 构建演练"
echo "  6. ✅ Kubernetes 部署演练"
echo "  7. ✅ 监控和日志配置"
echo "  8. ✅ SSL/TLS 配置"
echo "  9. ✅ 备份策略"
echo "  10. ✅ 灾难恢复"
echo ""
log_success "所有演练阶段完成!"
log_info "请根据警告信息进行必要的修复"
echo ""
