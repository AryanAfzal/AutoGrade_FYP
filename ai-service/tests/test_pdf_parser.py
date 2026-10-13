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

    def test_splits_real_pdf_ocr_question_markers_and_common_label_formats(self):
        marker_pairs = [
            ("4 01.", "402"),
            ("Question # 01", "Question 02"),
            ("Q # 01", "Q # 02"),
            ("Q#01", "Q02"),
        ]

        for first_marker, second_marker in marker_pairs:
            with self.subTest(first_marker=first_marker, second_marker=second_marker):
                lines = [
                    {"text": first_marker, "confidence": 0.8},
                    {"text": "Artificial Intelligence is a branch of computer science.", "confidence": 0.85},
                    {"text": second_marker, "confidence": 0.8},
                    {"text": "Machine learning learns patterns from data.", "confidence": 0.84},
                ]

                grouped = _group_ocr_lines_by_question(
                    lines,
                    expected_question_count=2,
                )
                parsed = _parse_answers_from_lines(
                    [item["text"] for item in lines],
                    expected_question_count=2,
                )

                self.assertEqual(
                    [item["text"] for item in grouped[1]],
                    ["Artificial Intelligence is a branch of computer science."],
                )
                self.assertEqual(
                    [item["text"] for item in grouped[2]],
                    ["Machine learning learns patterns from data."],
                )
                self.assertEqual(
                    parsed,
                    [
                        {
                            "questionNumber": 1,
                            "answerText": "Artificial Intelligence is a branch of computer science.",
                        },
                        {
                            "questionNumber": 2,
                            "answerText": "Machine learning learns patterns from data.",
                        },
                    ],
                )

    def test_splits_unnumbered_handwritten_question_prompts(self):
        grouped = _group_ocr_lines_by_question(
            [
                {"text": "What is AI?", "confidence": 0.91},
                {"text": "AI is artificial intelligence.", "confidence": 0.84},
                {"text": "What is ML?", "confidence": 0.89},
                {"text": "ML learns patterns from data.", "confidence": 0.82},
            ],
            expected_question_count=2,
            expected_question_texts=["What is AI?", "What is ML?"],
        )

        self.assertEqual(
            [item["text"] for item in grouped[1]],
            ["AI is artificial intelligence."],
        )
        self.assertEqual(
            [item["text"] for item in grouped[2]],
            ["ML learns patterns from data."],
        )

    def test_parses_unnumbered_handwritten_question_prompts(self):
        answers = _parse_answers_from_lines(
            [
                "What is AI?",
                "AI is artificial intelligence.",
                "What is ML?",
                "ML learns patterns from data.",
            ],
            expected_question_count=2,
            expected_question_texts=["What is AI?", "What is ML?"],
        )

        self.assertEqual(
            answers,
            [
                {
                    "questionNumber": 1,
                    "answerText": "AI is artificial intelligence.",
                },
                {
                    "questionNumber": 2,
                    "answerText": "ML learns patterns from data.",
                },
            ],
        )

    def test_groups_question_prompts_when_answers_are_out_of_order(self):
        grouped = _group_ocr_lines_by_question(
            [
                {"text": "What is Artificial Intelligence?", "confidence": 0.91},
                {"text": "Artificial Intelligence creates intelligent machines.", "confidence": 0.84},
                {"text": "What is Machine Learning?", "confidence": 0.89},
                {"text": "Machine Learning learns patterns from data.", "confidence": 0.82},
            ],
            expected_question_count=2,
            expected_question_texts=[
                "What is Machine Learning?",
                "What is Artificial Intelligence?",
            ],
        )

        self.assertEqual(
            [item["text"] for item in grouped[2]],
            ["Artificial Intelligence creates intelligent machines."],
        )
        self.assertEqual(
            [item["text"] for item in grouped[1]],
            ["Machine Learning learns patterns from data."],
        )

    def test_parses_question_prompts_when_answers_are_out_of_order(self):
        answers = _parse_answers_from_lines(
            [
                "What is Artificial Intelligence?",
                "Artificial Intelligence creates intelligent machines.",
                "What is Machine Learning?",
                "Machine Learning learns patterns from data.",
            ],
            expected_question_count=2,
            expected_question_texts=[
                "What is Machine Learning?",
                "What is Artificial Intelligence?",
            ],
        )

        self.assertEqual(
            answers,
            [
                {
                    "questionNumber": 1,
                    "answerText": "Machine Learning learns patterns from data.",
                },
                {
                    "questionNumber": 2,
                    "answerText": "Artificial Intelligence creates intelligent machines.",
                },
            ],
        )

    def test_starts_next_question_on_short_question_line_without_prompt_match(self):
        question_texts = [
            "Describe computer networks.",
            "Explain operating systems.",
        ]
        ocr_lines = [
            {"text": "Why do students write notes?", "confidence": 0.9},
            {"text": "They record important information.", "confidence": 0.85},
            {"text": "How do clouds form?", "confidence": 0.9},
            {"text": "Water vapor cools and condenses.", "confidence": 0.84},
        ]

        grouped = _group_ocr_lines_by_question(
            ocr_lines,
            expected_question_count=2,
            expected_question_texts=question_texts,
        )
        answers = _parse_answers_from_lines(
            [item["text"] for item in ocr_lines],
            expected_question_count=2,
            expected_question_texts=question_texts,
        )

        self.assertEqual(
            [item["text"] for item in grouped[1]],
            ["They record important information."],
        )
        self.assertEqual(
            [item["text"] for item in grouped[2]],
            ["Water vapor cools and condenses."],
        )
        self.assertEqual(
            answers,
            [
                {
                    "questionNumber": 1,
                    "answerText": "They record important information.",
                },
                {
                    "questionNumber": 2,
                    "answerText": "Water vapor cools and condenses.",
                },
            ],
        )

    def test_question_text_after_numbered_marker_does_not_start_another_question(self):
        lines = [
            "Q1",
            "What is Machine Learning?",
            "Machine learning learns patterns from data.",
            "Q2",
            "What is Artificial Intelligence?",
            "Artificial intelligence enables machines to perform intelligent tasks.",
        ]
        question_texts = [
            "What is Machine Learning?",
            "What is Artificial Intelligence?",
        ]

        grouped = _group_ocr_lines_by_question(
            [{"text": line, "confidence": 0.9} for line in lines],
            expected_question_count=2,
            expected_question_texts=question_texts,
        )
        answers = _parse_answers_from_lines(
            lines,
            expected_question_count=2,
            expected_question_texts=question_texts,
        )

        self.assertEqual(
            [item["text"] for item in grouped[1]],
            ["Machine learning learns patterns from data."],
        )
        self.assertEqual(
            [item["text"] for item in grouped[2]],
            ["Artificial intelligence enables machines to perform intelligent tasks."],
        )
        self.assertEqual(
            answers,
            [
                {
                    "questionNumber": 1,
                    "answerText": "Machine learning learns patterns from data.",
                },
                {
                    "questionNumber": 2,
                    "answerText": "Artificial intelligence enables machines to perform intelligent tasks.",
                },
            ],
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
