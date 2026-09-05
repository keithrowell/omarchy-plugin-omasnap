"""Sample fixture for the Omasnap highlight-path spike.

Exercises comments, docstrings, f-strings, numbers, decorators, classes,
keywords, builtins and punctuation.
"""

from dataclasses import dataclass
from typing import Optional

MAX_RETRIES: int = 3
PATTERN = r"^[a-z0-9_-]+$"


@dataclass
class Snippet:
    """Represents a themed snippet ready for rendering."""

    source: str
    language: str = "python"

    def __post_init__(self) -> None:
        self._tokens: list[dict] = []

    @classmethod
    def from_file(cls, path: str) -> "Snippet":
        return cls(source=path)

    def tokenize(self) -> list[dict]:
        label = f"tokenizing {self.language}"
        print(label)
        for i in range(MAX_RETRIES):
            ok = bool(self.language)
            self._tokens.append({"index": i, "ok": ok})
        return self._tokens

    @property
    def token_count(self) -> int:
        return len(self._tokens)


def greet(name: str, count: Optional[int] = None) -> str:
    count = count if count is not None else 1 + 2
    return f"Hello, {name}! You have {count} new messages."


def main() -> None:
    with open("fixtures/sample.py", "r", encoding="utf8") as handle:
        contents = handle.read()
    snippet = Snippet(contents)
    snippet.tokenize()
    print(greet("Omasnap"), snippet.token_count, len(contents) > 0)


if __name__ == "__main__":
    try:
        main()
    except Exception as err:  # noqa: BLE001
        print(f"failed: {err}")
