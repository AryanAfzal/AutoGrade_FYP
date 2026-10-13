import unittest
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

    def test_text_cleaner_applies_ocr_replacements_and_preserves_confidence(self):
        raw_line = {"text": "0ver may be wrong", "confidence": 0.37}
        with (
            patch.object(
                text_cleaner,
                "_request_ollama",
                side_effect=OSError("Ollama is unavailable"),
            ),
            patch.object(text_cleaner.sym_spell, "lookup_compound", return_value=[]),
        ):
            cleaned = text_cleaner.clean_results([raw_line])

        self.assertEqual(
            cleaned,
            [{"text": "over may be wrong", "confidence": 0.37}],
        )

    def test_text_cleaner_corrects_context_together_with_ollama(self):
        with patch.object(
            text_cleaner,
            "_request_ollama",
            return_value="Large Language Models\nThey learn patterns.",
        ) as request:
            cleaned = text_cleaner.clean_results(
                [
                    {"text": "Jorge Languaqe Models", "confidence": 0.4},
                    {"text": "They learn patterns.", "confidence": 0.6},
                ]
            )

        self.assertIn(
            "Jorge Languaqe Models\nThey learn patterns.",
            request.call_args.args[0],
        )
        self.assertEqual(
            cleaned,
            [
                {"text": "Large Language Models", "confidence": 0.98},
                {"text": "They learn patterns.", "confidence": 0.98},
            ],
        )

    def test_text_cleaner_skips_ollama_after_deadline(self):
        with (
            patch.object(text_cleaner, "_request_ollama") as request,
            patch.object(
                text_cleaner.sym_spell,
                "lookup_compound",
                return_value=[],
            ),
        ):
            cleaned = text_cleaner.clean_results(
                [{"text": "keep the original line", "confidence": 0.71}],
                deadline=0,
            )

        self.assertEqual(
            cleaned,
            [{"text": "keep the original line", "confidence": 0.71}],
        )
        request.assert_not_called()

    def test_text_cleaner_filters_watermarks_and_numeric_noise(self):
        cleaned = text_cleaner.clean_results(
            [
                {"text": "Scanned with CamScanner", "confidence": 0.9},
                {"text": "42", "confidence": 0.9},
            ]
        )

        self.assertEqual(cleaned, [])


if __name__ == "__main__":
    unittest.main()
