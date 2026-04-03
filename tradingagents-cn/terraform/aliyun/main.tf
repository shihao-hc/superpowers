# Terraform Configuration for Aliyun ACK
# Deploy TradingAgents-CN to Alibaba Cloud Container Service for Kubernetes

terraform {
  required_version = ">= 1.0"
  required_providers {
    alicloud = {
      source  = "aliyun/alicloud"
      version = "~> 1.200"
    }
  }
}

variable "region" {
  description = "Alibaba Cloud region"
  type        = string
  default     = "cn-beijing"
}

variable "cluster_name" {
  description = "ACK cluster name"
  type        = string
  default     = "tradingagents-cn"
}

variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "192.168.0.0/16"
}

variable "zone_ids" {
  description = "Availability zones"
  type        = list(string)
  default     = ["cn-beijing-h", "cn-beijing-j"]
}

# Provider configuration
provider "alicloud" {
  region = var.region
}

# VPC
resource "alicloud_vpc" "main" {
  vpc_name   = var.cluster_name
  cidr_block = var.vpc_cidr
}

# VSwitch
resource "alicloud_vswitch" "main" {
  count        = length(var.zone_ids)
  vpc_id       = alicloud_vpc.main.id
  cidr_block   = cidrsubnet(var.vpc_cidr, 8, count.index)
  zone_id      = var.zone_ids[count.index]
  vswitch_name = "${var.cluster_name}-vsw-${count.index}"
}

# ACK Cluster
resource "alicloud_cs_serverless_kubernetes" "main" {
  name               = var.cluster_name
  zone_ids          = var.zone_ids
  vswitch_ids       = alicloud_vswitch.main[*].id
  vpc_id            = alicloud_vpc.main.id
  cluster_spec      = "ack.pro.small"
  cluster_ca_certification = ""
  
  # Addon components
  addons {
    name   = "terway-eniip"
  }
}

# NAT Gateway for internet access
resource "alicloud_nat_gateway" "main" {
  vpc_id        = alicloud_vpc.main.id
  specification = "Small"
  nat_gateway_name = "${var.cluster_name}-nat"
}

# EIP for NAT
resource "alicloud_eip" "main" {
  name = "${var.cluster_name}-eip"
}

resource "alicloud_nat_gateway_binding" "main" {
  nat_gateway_id = alicloud_nat_gateway.main.id
  eip_id         = alicloud_eip.main.id
}

# SLB for API service
resource "alicloud_slb" "api" {
  name       = "${var.cluster_name}-api"
  vswitch_id = alicloud_vswitch.main[0].id
  
  internet = true
  internet_charge_type = "PayByTraffic"
}

# SLB for Frontend
resource "alicloud_slb" "frontend" {
  name       = "${var.cluster_name}-frontend"
  vswitch_id = alicloud_vswitch.main[0].id
  
  internet = true
  internet_charge_type = "PayByTraffic"
}

# ACK ConfigMap for TradingAgents-CN
resource "alicloud_configurations" "helm_values" {
  name     = "${var.cluster_name}-values"
  category = "Container"
  content  = file("${path.module}/../k8s/helm/values.yaml")
}

# Outputs
output "cluster_id" {
  value = alicloud_cs_serverless_kubernetes.main.id
}

output "cluster_kubeconfig" {
  value     = alicloud_cs_serverless_kubernetes.main.kubeconfig
  sensitive = true
}

output "api_slb_ip" {
  value = alicloud_slb.api.address
}

output "frontend_slb_ip" {
  value = alicloud_slb.frontend.address
}

output "vpc_id" {
  value = alicloud_vpc.main.id
}

output "nat_eip" {
  value = alicloud_eip.main.ip_address
}
