import unittest
import re
import time
from unittest.mock import patch

from services.pdf_parser import (
    _group_ocr_lines_by_question,
    _parse_answers_from_lines,
)
from services import text_cleaner


class PDFParserTests(unittest.TestCase):
    def test_groups_corrupted_question_labels_before_correction(self):
        grouped = _group_ocr_lines_by_question(
            [
                {"text": "Y01", "confidence": 0.42},
                {"text": "Intelligence is computing.", "confidence": 0.71},
                {"text": "2 ft0 2", "confidence": 0.38},
                {"text": "This is the second answer.", "confidence": 0.69},
            ],
            expected_question_count=2,
        )

        self.assertEqual(
            [item["text"] for item in grouped[1]],
            ["Intelligence is computing."],
        )
        self.assertEqual(
            [item["text"] for item in grouped[2]],
            ["This is the second answer."],
        )

    def test_keeps_long_numeric_answer_line_in_current_question(self):
        grouped = _group_ocr_lines_by_question(
            [
                {"text": "Q1: First answer.", "confidence": 0.8},
                {
                    "text": "1 The answer has multiple parts and explains the process.",
                    "confidence": 0.7,
                },
            ],
            expected_question_count=2,
        )

        self.assertEqual(
            [item["text"] for item in grouped[1]],
            [
                "First answer.",
                "1 The answer has multiple parts and explains the process.",
            ],
        )

    def test_parses_plain_text_answers_after_numbered_headers(self):
        answers = _parse_answers_from_lines(
            [
                "Q1:",
                "First answer continues",
                "on this line.",
                "2. Second answer.",
            ],
            expected_question_count=2,
        )

        self.assertEqual(
            answers,
            [
                {
                    "questionNumber": 1,
                    "answerText": "First answer continues on this line.",
                },
                {"questionNumber": 2, "answerText": "Second answer."},
            ],
        )

    def test_parses_plain_text_answers_after_bare_question_headers(self):
        answers = _parse_answers_from_lines(
            ["Question:", "This is the complete student answer."],
            expected_question_count=1,
        )

        self.assertEqual(
            answers,
            [
                {
                    "questionNumber": 1,
                    "answerText": "This is the complete student answer.",
                }
            ],
        )

    def test_plain_numeric_prose_does_not_start_a_new_question(self):
        answers = _parse_answers_from_lines(
            ["Q1:", "The answer is", "2 feet long and 3 feet wide."],
            expected_question_count=2,
        )

        self.assertEqual(
            answers,
            [
                {
                    "questionNumber": 1,
                    "answerText": "The answer is 2 feet long and 3 feet wide.",
                }
            ],
        )

    def test_question_header_cannot_exceed_expected_count(self):
        answers = _parse_answers_from_lines(
            ["Q1: First answer.", "Q3: This is still Q1 answer text."],
            expected_question_count=2,
        )

        self.assertEqual(
            answers,
            [
                {
                    "questionNumber": 1,
                    "answerText": "First answer. Q3: This is still Q1 answer text.",
                }
            ],
        )

    def test_text_cleaner_preserves_raw_text_and_recognizer_confidence_on_failure(self):
        raw_line = {"text": "recogntion may be wrong", "confidence": 0.37}
        with (
            patch.object(text_cleaner, "OCR_ENABLE_OLLAMA", True),
            patch.object(
                text_cleaner,
                "_ask_ollama",
                side_effect=OSError("Ollama is unavailable"),
            ),
        ):
            cleaned = text_cleaner.clean_results([raw_line])

        self.assertEqual(
            cleaned,
            [{"text": "recogntion may be wrong", "confidence": 0.37}],
        )

    def test_text_cleaner_keeps_numeric_answers(self):
        with patch.object(text_cleaner, "OCR_ENABLE_OLLAMA", False):
            cleaned = text_cleaner.clean_results(
                [{"text": "42", "confidence": 0.91}]
            )

        self.assertEqual(cleaned, [{"text": "42", "confidence": 0.91}])

    def test_text_cleaner_splits_long_answers_into_bounded_chunks(self):
        received_prompts = []

        def echo_numbered_lines(prompt, timeout):
            received_prompts.append(prompt)
            lines = prompt.rsplit("Now fix these lines:\n", 1)[1]
            return "\n".join(
                f"{match.group(1)}| {match.group(2)}"
                for match in re.finditer(r"^(\d+)\|\s?(.*)$", lines, re.MULTILINE)
            )

        lines = [
            {"text": "first line", "confidence": 0.4},
            {"text": "second line", "confidence": 0.6},
            {"text": "third line", "confidence": 0.8},
        ]
        with (
            patch.object(text_cleaner, "OCR_ENABLE_OLLAMA", True),
            patch.object(text_cleaner, "OLLAMA_MAX_CHUNK_CHARS", 12),
            patch.object(text_cleaner, "_ask_ollama", side_effect=echo_numbered_lines),
        ):
            cleaned = text_cleaner.clean_results(lines)

        self.assertEqual(len(received_prompts), 3)
        self.assertEqual(
            [
                prompt.rsplit("Now fix these lines:\n", 1)[1].strip().split("| ", 1)[1]
                for prompt in received_prompts
            ],
            ["first line", "second line", "third line"],
        )
        self.assertEqual(
            cleaned,
            [
                {"text": "first line", "confidence": 0.4},
                {"text": "second line", "confidence": 0.6},
                {"text": "third line", "confidence": 0.8},
            ],
        )

    def test_text_cleaner_stops_requesting_correction_after_deadline(self):
        with patch.object(text_cleaner, "_ask_ollama") as ask_ollama:
            corrected = text_cleaner.correct_lines(
                ["keep the original line"],
                deadline=time.monotonic() - 1,
            )

        self.assertEqual(corrected, ["keep the original line"])
        ask_ollama.assert_not_called()


if __name__ == "__main__":
    unittest.main()
