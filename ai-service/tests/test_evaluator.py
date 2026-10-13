import unittest
from unittest.mock import patch

import numpy as np

from services.evaluator import evaluate_answer_sheet, evaluate_descriptive
from routers.evaluate import QuestionPayload


class RubricEvaluationTests(unittest.TestCase):
    def setUp(self):
        self.rubric = {
            "concepts": [
                {
                    "name": "LIFO behavior",
                    "description": "A stack removes the most recently added item first.",
                    "keywords": ["last in first out"],
                    "maxMarks": 4,
                    "strictness": "balanced",
                },
                {
                    "name": "Push and pop",
                    "description": "Push adds an item and pop removes an item.",
                    "keywords": ["push", "pop"],
                    "maxMarks": 2,
                    "strictness": "lenient",
                },
            ],
            "scoringWeights": {"semantic": 0.4, "keywords": 0.2, "concepts": 0.4},
        }

    def test_questions_without_a_rubric_keep_the_keyword_only_path(self):
        result = evaluate_descriptive("A stack uses LIFO.", "", ["LIFO"], 5)

        self.assertEqual(result["aiMark"], 5)
        self.assertNotIn("rubricBreakdown", result)

    def test_rubric_returns_weighted_checkpoint_breakdown_and_feedback(self):
        with (
            patch(
                "services.evaluator.encode",
                return_value=np.asarray([[1.0], [2.0], [3.0], [4.0]], dtype=float),
            ),
            patch(
                "services.evaluator.cosine_similarity",
                side_effect=lambda a, b: {
                    (1.0, 2.0): 0.8,
                    (1.0, 3.0): 0.9,
                    (1.0, 4.0): 0.6,
                }[(float(a[0]), float(b[0]))],
            ),
        ):
            result = evaluate_descriptive(
                "A stack follows last in first out. Push adds items.",
                "A stack removes the latest item first.",
                ["stack", "last in first out"],
                6,
                rubric=self.rubric,
            )

        self.assertEqual(result["maxMarks"], 6)
        self.assertGreater(result["aiMark"], 0)
        self.assertLessEqual(result["aiMark"], 6)
        self.assertEqual(len(result["rubricBreakdown"]), 2)
        self.assertEqual(
            [item["conceptName"] for item in result["rubricBreakdown"]],
            ["LIFO behavior", "Push and pop"],
        )
        self.assertEqual(
            sum(item["awardedMarks"] for item in result["rubricBreakdown"]),
            4.41,
        )
        self.assertIn("Addressed:", result["feedback"])
        self.assertIn("Partially addressed:", result["feedback"])

    def test_blank_answer_gets_zero_for_each_rubric_checkpoint(self):
        result = evaluate_descriptive("", "", [], 6, rubric=self.rubric)

        self.assertEqual(result["aiMark"], 0.0)
        self.assertEqual(result["conceptScore"], 0.0)
        self.assertTrue(all(item["awardedMarks"] == 0 for item in result["rubricBreakdown"]))
        self.assertIn("Not addressed:", result["feedback"])

    def test_rubric_is_applied_to_each_answer_sheet_entry(self):
        with (
            patch(
                "services.evaluator.encode",
                return_value=np.asarray([[1.0], [2.0], [3.0], [4.0]], dtype=float),
            ),
            patch("services.evaluator.cosine_similarity", return_value=0.8),
        ):
            result = evaluate_answer_sheet(
                [{"questionNumber": 1, "answerText": "A stack follows last in first out."}],
                [
                    {
                        "id": "question-1",
                        "type": "descriptive",
                        "questionText": "Explain stack behavior",
                        "maxMarks": 6,
                        "referenceAnswer": "A stack removes the latest item first.",
                        "keywords": ["stack"],
                        "rubric": self.rubric,
                    }
                ],
            )

        entry = result["entries"][0]
        self.assertIn("rubricBreakdown", entry)
        self.assertIn("feedback", entry)
        self.assertEqual(entry["questionId"], "question-1")

    def test_evaluation_payload_preserves_nested_rubric_configuration(self):
        question = QuestionPayload(
            id="question-1",
            type="descriptive",
            questionText="Explain stacks.",
            maxMarks=6,
            clo="CLO-1",
            rubric=self.rubric,
        )

        self.assertEqual(question.model_dump()["rubric"]["concepts"][0]["name"], "LIFO behavior")
        self.assertEqual(question.model_dump()["rubric"]["scoringWeights"]["concepts"], 0.4)


if __name__ == "__main__":
    unittest.main()
