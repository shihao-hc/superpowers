#!/bin/bash

set -e

BACKUP_DIR="/backups"
DATA_DIR="/app/data"
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-7}
S3_BUCKET=${S3_BUCKET:-}
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="ultrawork_backup_${TIMESTAMP}.zip"

echo "[Backup] Starting backup at $(date)"
echo "[Backup] Backup retention: ${RETENTION_DAYS} days"

cd /backups

if [ -d "${DATA_DIR}" ]; then
    echo "[Backup] Creating backup archive..."
    zip -r "${BACKUP_NAME}" "${DATA_DIR}" -x "*.log" -x "node_modules/*"
    
    echo "[Backup] Backup size: $(du -h ${BACKUP_NAME} | cut -f1)"
    
    if [ -n "${S3_BUCKET}" ]; then
        echo "[Backup] Uploading to S3: ${S3_BUCKET}"
        if command -v aws &> /dev/null; then
            aws s3 cp "${BACKUP_NAME}" "s3://${S3_BUCKET}/backups/${BACKUP_NAME}"
            echo "[Backup] Uploaded to S3"
        else
            echo "[Backup] AWS CLI not available, skipping S3 upload"
        fi
    fi
    
    echo "[Backup] Cleaning old backups..."
    find . -name "ultrawork_backup_*.zip" -mtime +${RETENTION_DAYS} -delete
    echo "[Backup] Cleanup complete"
    
    echo "[Backup] Current backups:"
    ls -lh ultrawork_backup_*.zip 2>/dev/null || echo "No backups found"
else
    echo "[Backup] Data directory not found: ${DATA_DIR}"
    exit 1
fi

echo "[Backup] Backup completed at $(date)"
