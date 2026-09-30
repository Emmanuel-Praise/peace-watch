from enum import Enum


class ReportType(str, Enum):
    ROBBERY = "robbery"
    THEFT = "theft"
    VANDALISM = "vandalism"
    FIRE = "fire"
    FLOOD = "flood"
    SUSPICIOUS_ACTIVITY = "suspicious_activity"
    MEDICAL_EMERGENCY = "medical_emergency"
    VIOLENCE = "violence"
    OTHER = "other"


class SeverityLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ReportStatus(str, Enum):
    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    VERIFIED = "verified"
    DISMISSED = "dismissed"


class ClusterPriority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ClusterStatus(str, Enum):
    ACTIVE = "active"
    MONITORING = "monitoring"


class AlertStatus(str, Enum):
    NEW = "new"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"