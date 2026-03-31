"""Centralized URL validation for SSRF protection."""

import ipaddress
import logging
import socket
from urllib.parse import urlparse
from typing import Tuple

logger = logging.getLogger(__name__)


ALLOWED_URL_SCHEMES = ("http", "https")
BLOCKED_HOSTS = ("localhost", "127.0.0.1", "0.0.0.0", "::1")
BLOCKED_DOMAINS = {
    "169.254.169.254",
    "metadata.google.internal",
    "metadata.azure.com",
    "metadata.internal",
    "kubernetes.default.svc",
}

PRIVATE_NETWORKS_IPV4 = [
    ipaddress.ip_network("10.0.0.0/8", strict=False),
    ipaddress.ip_network("172.16.0.0/12", strict=False),
    ipaddress.ip_network("192.168.0.0/16", strict=False),
    ipaddress.ip_network("127.0.0.0/8", strict=False),
    ipaddress.ip_network("0.0.0.0/8", strict=False),
    ipaddress.ip_network("169.254.0.0/16", strict=False),
]

PRIVATE_NETWORKS_IPV6 = [
    ipaddress.ip_network("::1/128", strict=False),
    ipaddress.ip_network("fc00::/7", strict=False),
    ipaddress.ip_network("fe80::/10", strict=False),
]


def validate_url_structure(url: str) -> Tuple[bool, str]:
    """Validate URL structure (scheme, host presence).

    Args:
        url: URL to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    if not url:
        return False, "URL cannot be empty"

    try:
        parsed = urlparse(url)
    except Exception as e:
        return False, f"Invalid URL format: {e}"

    if not parsed.scheme:
        return False, "URL must have a scheme (http:// or https://)"

    if parsed.scheme not in ALLOWED_URL_SCHEMES:
        return False, f"URL scheme must be http or https, got: {parsed.scheme}"

    if not parsed.netloc:
        return False, "URL must have a host"

    return True, ""


def validate_url_host(url: str) -> Tuple[bool, str]:
    """Validate URL host against blocked hosts and domains.

    Args:
        url: URL to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        parsed = urlparse(url)
    except Exception:
        return False, "Invalid URL format"

    hostname = parsed.hostname or ""

    if hostname.lower() in BLOCKED_HOSTS:
        return False, f"URL host not allowed: {hostname}"

    if hostname in BLOCKED_DOMAINS:
        return False, f"Metadata endpoint not allowed: {hostname}"

    if hostname.startswith("169.254."):
        return False, f"AWS metadata endpoint not allowed: {hostname}"

    if parsed.netloc.startswith("10.") or parsed.netloc.startswith("192.168."):
        return False, "Private IP range not allowed"

    if parsed.netloc.startswith("172."):
        try:
            parts = parsed.netloc.split(".")
            if len(parts) >= 2:
                second_octet = int(parts[1])
                if 16 <= second_octet <= 31:
                    return False, "Private IP range (172.16-31.x.x) not allowed"
        except (ValueError, IndexError):
            pass

    return True, ""


def validate_url_dns(url: str) -> Tuple[bool, str]:
    """Validate URL by checking DNS resolution for private IPs.

    Args:
        url: URL to validate

    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        parsed = urlparse(url)
    except Exception:
        return False, "Invalid URL format"

    hostname = parsed.hostname or ""
    if not hostname:
        return True, ""

    try:
        infos = socket.getaddrinfo(hostname, None)
        for family, _, _, _, sockaddr in infos:
            ip_str = sockaddr[0]
            try:
                addr = ipaddress.ip_address(ip_str)

                for network in PRIVATE_NETWORKS_IPV4 + PRIVATE_NETWORKS_IPV6:
                    if addr in network:
                        logger.warning(f"SSRF attempt blocked: {ip_str} in {network}")
                        return False, f"Private IP access not allowed: {ip_str}"
            except ValueError:
                continue
    except socket.gaierror:
        pass

    return True, ""


def validate_url(url: str, raise_on_error: bool = True) -> bool:
    """Comprehensive URL validation for SSRF protection.

    Multi-layer validation:
    1. Structure validation (scheme, host presence)
    2. Host validation (blocked hosts, metadata endpoints, private IPs in netloc)
    3. DNS resolution validation (prevents DNS rebinding)

    Args:
        url: URL to validate
        raise_on_error: If True, raise ValueError on invalid URL

    Returns:
        True if URL is safe

    Raises:
        ValueError: If URL is invalid and raise_on_error is True
    """
    valid, error = validate_url_structure(url)
    if not valid:
        if raise_on_error:
            raise ValueError(error)
        return False

    valid, error = validate_url_host(url)
    if not valid:
        if raise_on_error:
            raise ValueError(error)
        return False

    valid, error = validate_url_dns(url)
    if not valid:
        if raise_on_error:
            raise ValueError(error)
        return False

    return True


def is_url_safe(url: str) -> bool:
    """Check if URL is safe without raising exceptions.

    Args:
        url: URL to validate

    Returns:
        True if URL is safe, False otherwise
    """
    try:
        return validate_url(url, raise_on_error=False)
    except Exception:
        return False
