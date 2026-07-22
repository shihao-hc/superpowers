"""Data validation and confidence scoring."""

from dataclasses import dataclass, field
from typing import Optional, Any, Callable
from enum import Enum
import re


class ValidationLevel(Enum):
    """Validation strictness levels."""

    STRICT = "strict"
    NORMAL = "normal"
    LENIENT = "lenient"


@dataclass
class ValidationIssue:
    """Validation issue detail."""

    field: str
    issue: str
    severity: str
    suggestion: Optional[str] = None


@dataclass
class ValidationResult:
    """Result of data validation."""

    is_valid: bool
    confidence: float
    issues: list[ValidationIssue]
    score: float = 0.0

    def __post_init__(self):
        if self.issues:
            error_count = sum(1 for i in self.issues if i.severity == "error")
            self.is_valid = error_count == 0
            self.score = max(0, 1.0 - (error_count * 0.3) - (len(self.issues) * 0.05))


@dataclass
class FieldSchema:
    """Schema definition for field validation."""

    name: str
    field_type: str
    required: bool = False
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    pattern: Optional[str] = None
    choices: Optional[list] = None
    custom_validator: Optional[Callable] = None


class DataValidator:
    """
    Comprehensive data validation.

    Features:
    - Type validation
    - Range validation
    - Pattern matching
    - Custom validators
    - Detailed error reporting
    """

    TYPE_VALIDATORS = {
        "string": lambda v: isinstance(v, str),
        "integer": lambda v: isinstance(v, int) and not isinstance(v, bool),
        "float": lambda v: isinstance(v, (int, float)) and not isinstance(v, bool),
        "boolean": lambda v: isinstance(v, bool)
        or str(v).lower() in ("true", "false", "0", "1", "yes", "no"),
        "url": lambda v: bool(re.match(r"^https?://", str(v))) if v else False,
        "email": lambda v: bool(re.match(r"^[\w\.-]+@[\w\.-]+\.\w+$", str(v)))
        if v
        else False,
        "date": lambda v: bool(re.match(r"\d{4}-\d{2}-\d{2}", str(v))) if v else False,
        "datetime": lambda v: bool(re.match(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", str(v)))
        if v
        else False,
        "phone": lambda v: bool(re.match(r"[\d\s\-\+\(\)]+", str(v))) if v else False,
    }

    def __init__(
        self,
        schema: list[FieldSchema],
        level: ValidationLevel = ValidationLevel.NORMAL,
    ):
        """
        Initialize validator.

        Args:
            schema: List of field schemas
            level: Validation strictness
        """
        self.schema = {s.name: s for s in schema}
        self.level = level

    def validate(self, data: dict) -> ValidationResult:
        """
        Validate data against schema.

        Args:
            data: Data to validate

        Returns:
            ValidationResult
        """
        issues = []
        total_score = 0.0
        field_count = 0

        for field_name, field_schema in self.schema.items():
            value = data.get(field_name)
            field_count += 1

            field_issues, field_score = self._validate_field(
                field_name, value, field_schema
            )
            issues.extend(field_issues)
            total_score += field_score

        confidence = total_score / field_count if field_count > 0 else 0.0

        return ValidationResult(
            is_valid=len([i for i in issues if i.severity == "error"]) == 0,
            confidence=confidence,
            issues=issues,
            score=confidence,
        )

    def _validate_field(
        self,
        field_name: str,
        value: Any,
        schema: FieldSchema,
    ) -> tuple[list[ValidationIssue], float]:
        """Validate single field."""
        issues = []
        score = 1.0

        if value is None or value == "":
            if schema.required:
                issues.append(
                    ValidationIssue(
                        field=field_name,
                        issue="Required field is empty",
                        severity="error",
                        suggestion="Provide a value for this field",
                    )
                )
                score -= 0.5
            else:
                score -= 0.1
            return issues, score

        if schema.field_type in self.TYPE_VALIDATORS:
            validator = self.TYPE_VALIDATORS[schema.field_type]
            if not validator(value):
                issues.append(
                    ValidationIssue(
                        field=field_name,
                        issue=f"Invalid {schema.field_type}",
                        severity="error",
                        suggestion=f"Value should be a valid {schema.field_type}",
                    )
                )
                score -= 0.3

        if schema.min_length and len(str(value)) < schema.min_length:
            issues.append(
                ValidationIssue(
                    field=field_name,
                    issue=f"Value too short (min: {schema.min_length})",
                    severity="warning",
                    suggestion=f"Value should be at least {schema.min_length} characters",
                )
            )
            score -= 0.2

        if schema.max_length and len(str(value)) > schema.max_length:
            issues.append(
                ValidationIssue(
                    field=field_name,
                    issue=f"Value too long (max: {schema.max_length})",
                    severity="warning",
                    suggestion=f"Value should be at most {schema.max_length} characters",
                )
            )
            score -= 0.1

        if schema.pattern:
            pattern = re.compile(schema.pattern)
            if not pattern.match(str(value)):
                issues.append(
                    ValidationIssue(
                        field=field_name,
                        issue="Value does not match pattern",
                        severity="warning",
                        suggestion=f"Value should match pattern: {schema.pattern}",
                    )
                )
                score -= 0.2

        if schema.choices and value not in schema.choices:
            issues.append(
                ValidationIssue(
                    field=field_name,
                    issue=f"Value not in allowed choices",
                    severity="error"
                    if self.level == ValidationLevel.STRICT
                    else "warning",
                    suggestion=f"Value must be one of: {', '.join(str(c) for c in schema.choices)}",
                )
            )
            score -= 0.3

        if schema.custom_validator:
            try:
                if not schema.custom_validator(value):
                    issues.append(
                        ValidationIssue(
                            field=field_name,
                            issue="Custom validation failed",
                            severity="warning",
                        )
                    )
                    score -= 0.2
            except Exception:
                issues.append(
                    ValidationIssue(
                        field=field_name,
                        issue="Custom validator error",
                        severity="error",
                    )
                )
                score -= 0.4

        return issues, max(0, score)


class ConfidenceScorer:
    """
    Calculate extraction confidence scores.

    Factors:
    - Data completeness
    - Field presence
    - Data quality
    - Source reliability
    """

    @staticmethod
    def score_extraction(
        extracted_data: dict,
        schema_type: str,
    ) -> float:
        """
        Score extraction quality.

        Args:
            extracted_data: Extracted data dict
            schema_type: Schema.org type

        Returns:
            Confidence score 0-1
        """
        score = 0.5

        required_fields = ConfidenceScorer._get_required_fields(schema_type)

        if required_fields:
            present = sum(
                1 for f in required_fields if f in extracted_data and extracted_data[f]
            )
            score += (present / len(required_fields)) * 0.3

        optional_fields = ConfidenceScorer._get_optional_fields(schema_type)
        if optional_fields:
            present = sum(
                1 for f in optional_fields if f in extracted_data and extracted_data[f]
            )
            score += (present / len(optional_fields)) * 0.1

        if extracted_data.get("text") and len(extracted_data["text"]) > 100:
            score += 0.1

        if extracted_data.get("image") or extracted_data.get("images"):
            score += 0.05

        return min(1.0, score)

    @staticmethod
    def _get_required_fields(schema_type: str) -> list[str]:
        """Get required fields for schema type."""
        required = {
            "article": ["headline", "author", "datePublished"],
            "product": ["name", "price"],
            "recipe": ["name", "author", "ingredients"],
            "event": ["name", "startDate"],
            "video": ["name", "description", "uploadDate"],
            "person": ["name"],
            "organization": ["name"],
        }
        return required.get(schema_type.lower(), [])

    @staticmethod
    def _get_optional_fields(schema_type: str) -> list[str]:
        """Get optional fields for schema type."""
        optional = {
            "article": ["image", "publisher", "description"],
            "product": ["image", "brand", "availability"],
            "recipe": ["image", "cookTime", "prepTime", "nutrition"],
            "event": ["image", "location", "performer"],
            "video": ["thumbnailUrl", "duration", "contentUrl"],
            "person": ["image", "jobTitle", "email"],
            "organization": ["url", "logo", "contactPoint"],
        }
        return optional.get(schema_type.lower(), [])


class DataCleaner:
    """
    Clean and normalize extracted data.

    Operations:
    - Whitespace normalization
    - HTML tag removal
    - URL normalization
    - Phone number formatting
    - Date normalization
    """

    @staticmethod
    def clean(data: dict) -> dict:
        """
        Clean all fields in data.

        Args:
            data: Data dict to clean

        Returns:
            Cleaned data dict
        """
        cleaned = {}

        for key, value in data.items():
            cleaned_key = key.strip()

            if isinstance(value, str):
                cleaned[cleaned_key] = DataCleaner.clean_text(value)
            elif isinstance(value, list):
                cleaned[cleaned_key] = [
                    DataCleaner.clean_text(v) if isinstance(v, str) else v
                    for v in value
                ]
            elif isinstance(value, dict):
                cleaned[cleaned_key] = DataCleaner.clean(value)
            else:
                cleaned[cleaned_key] = value

        return cleaned

    @staticmethod
    def clean_text(text: str) -> str:
        """Clean text content."""
        if not text:
            return ""

        text = re.sub(r"<[^>]+>", "", text)

        text = re.sub(r"\s+", " ", text)

        text = text.strip()

        return text

    @staticmethod
    def clean_url(url: str) -> str:
        """Clean and normalize URL."""
        if not url:
            return ""

        url = url.strip()

        url = re.sub(r"#.*$", "", url)

        url = re.sub(r"\?.*?(?=\?)", "", url)

        return url

    @staticmethod
    def normalize_date(date_str: str) -> Optional[str]:
        """Normalize date to ISO format."""
        if not date_str:
            return None

        patterns = [
            (r"(\d{4})-(\d{2})-(\d{2})", r"\1-\2-\3"),
            (r"(\d{4})/(\d{2})/(\d{2})", r"\1-\2-\3"),
            (r"(\d{2})/(\d{2})/(\d{4})", r"\3-\1-\2"),
        ]

        for pattern, replacement in patterns:
            match = re.search(pattern, date_str)
            if match:
                return re.sub(pattern, replacement, date_str)

        return date_str

    @staticmethod
    def normalize_phone(phone: str) -> str:
        """Normalize phone number."""
        if not phone:
            return ""

        digits = re.sub(r"\D", "", phone)

        if len(digits) == 10:
            return f"+1-{digits[:3]}-{digits[3:6]}-{digits[6:]}"
        elif len(digits) == 11 and digits[0] == "1":
            return f"+1-{digits[1:4]}-{digits[4:7]}-{digits[7:]}"

        return phone
