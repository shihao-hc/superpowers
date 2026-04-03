<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElCard, ElButton, ElTable, ElTableColumn, ElTag, ElPagination, ElEmpty } from 'element-plus'
import { ArrowLeft, Refresh, Delete, View } from '@element-plus/icons-vue'

const router = useRouter()

interface AnalysisRecord {
  task_id: string
  company: string
  trade_date: string
  status: string
  created_at: string
  completed_at?: string
  trading_plan?: {
    action: string
    risk_level: string
  }
}

const history = ref<AnalysisRecord[]>([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)

const statusType = (status: string) => {
  switch (status) {
    case 'completed': return 'success'
    case 'failed': return 'danger'
    case 'running': return 'primary'
    default: return 'info'
  }
}

const statusText = (status: string) => {
  switch (status) {
    case 'completed': return '已完成'
    case 'failed': return '失败'
    case 'running': return '运行中'
    case 'pending': return '等待中'
    default: return '未知'
  }
}

const actionColor = (action: string) => {
  switch (action) {
    case 'buy': return '#67C23A'
    case 'sell': return '#F56C6C'
    default: return '#909399'
  }
}

const loadHistory = async () => {
  loading.value = true
  try {
    const response = await fetch(`/api/v1/tasks?page=${currentPage.value}&page_size=${pageSize.value}`)
    const data = await response.json()
    history.value = data.tasks || []
    total.value = data.total || 0
  } catch (error) {
    console.error('Failed to load history:', error)
  } finally {
    loading.value = false
  }
}

const viewDetail = (row: AnalysisRecord) => {
  router.push({ name: 'analysis', query: { taskId: row.task_id } })
}

const handlePageChange = (page: number) => {
  currentPage.value = page
  loadHistory()
}

const deleteRecord = async (taskId: string) => {
  // In production, call delete API
  history.value = history.value.filter(h => h.task_id !== taskId)
}

onMounted(() => {
  loadHistory()
})
</script>

<template>
  <div class="history-container">
    <header class="history-header">
      <div class="header-left">
        <el-button :icon="ArrowLeft" @click="$router.push('/')">返回</el-button>
        <h2>历史记录</h2>
      </div>
      <div class="header-actions">
        <el-button :icon="Refresh" @click="loadHistory" :loading="loading">刷新</el-button>
      </div>
    </header>

    <el-card class="history-card">
      <el-table
        v-loading="loading"
        :data="history"
        style="width: 100%"
        stripe
      >
        <el-table-column prop="company" label="股票" width="150" />
        <el-table-column prop="trade_date" label="交易日期" width="120" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row.status)">{{ statusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="决策" width="100">
          <template #default="{ row }">
            <span
              v-if="row.trading_plan"
              class="action-badge"
              :style="{ color: actionColor(row.trading_plan.action) }"
            >
              {{ row.trading_plan.action?.toUpperCase() }}
            </span>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180">
          <template #default="{ row }">
            {{ new Date(row.created_at).toLocaleString() }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button :icon="View" size="small" @click="viewDetail(row)">查看</el-button>
            <el-button
              :icon="Delete"
              size="small"
              type="danger"
              @click="deleteRecord(row.task_id)"
            />
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-if="total > 0"
        class="pagination"
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :total="total"
        layout="prev, pager, next"
        @current-change="handlePageChange"
      />

      <el-empty v-if="!loading && history.length === 0" description="暂无历史记录">
        <el-button type="primary" @click="$router.push('/')">开始分析</el-button>
      </el-empty>
    </el-card>
  </div>
</template>

<style scoped>
.history-container {
  padding: 1.5rem;
  background: #f5f7fa;
  min-height: 100vh;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.header-left h2 {
  margin: 0;
  font-size: 1.5rem;
  color: #303133;
}

.history-card {
  border-radius: 8px;
}

.pagination {
  margin-top: 1rem;
  display: flex;
  justify-content: flex-end;
}

.action-badge {
  font-weight: bold;
  font-size: 0.9rem;
}
</style>
