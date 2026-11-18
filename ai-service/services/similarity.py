import re
import difflib
from typing import List, Dict, Any, Tuple
import numpy as np
from models.sbert_loader import encode, pairwise_similarity_matrix

SIMILARITY_THRESHOLD = 0.85  # Strict critical match threshold: > 85% only


def normalize_tokens(text: str) -> List[str]:
    """Tokenize text into lowercase alphanumeric words."""
    return re.findall(r'[a-zA-Z0-9]+', text.lower())


def compute_ngram_jaccard(tokens_a: List[str], tokens_b: List[str], n: int = 3) -> float:
    """Compute Jaccard similarity of n-grams."""
    if len(tokens_a) < n or len(tokens_b) < n:
        return 0.0
    ngrams_a = set(tuple(tokens_a[i:i+n]) for i in range(len(tokens_a) - n + 1))
    ngrams_b = set(tuple(tokens_b[i:i+n]) for i in range(len(tokens_b) - n + 1))
    if not ngrams_a or not ngrams_b:
        return 0.0
    intersection = len(ngrams_a & ngrams_b)
    union = len(ngrams_a | ngrams_b)
    return intersection / union if union > 0 else 0.0


def extract_matching_segments(text_a: str, text_b: str, min_length: int = 15) -> List[Dict[str, Any]]:
    """
    Find matching substrings between text_a and text_b using SequenceMatcher.
    Returns matched snippets and their character indices for UI highlighting.
    """
    matcher = difflib.SequenceMatcher(None, text_a.lower(), text_b.lower(), autojunk=False)
    matching_blocks = matcher.get_matching_blocks()
    
    segments = []
    for block in matching_blocks:
        if block.size >= min_length:
            phrase_a = text_a[block.a : block.a + block.size].strip()
            phrase_b = text_b[block.b : block.b + block.size].strip()
            if len(phrase_a) >= min_length:
                segments.append({
                    "startA": block.a,
                    "endA": block.a + block.size,
                    "startB": block.b,
                    "endB": block.b + block.size,
                    "textA": phrase_a,
                    "textB": phrase_b,
                    "length": block.size,
                })
    return segments


def compute_lexical_similarity(text_a: str, text_b: str) -> Tuple[float, List[Dict[str, Any]], int]:
    """
    Compute multi-faceted lexical similarity:
    - 3-gram and 4-gram Jaccard overlap
    - Longest Common Substring coverage
    Returns: (lexical_score, matched_segments, total_verbatim_chars)
    """
    tokens_a = normalize_tokens(text_a)
    tokens_b = normalize_tokens(text_b)
    
    if not tokens_a or not tokens_b:
        return 0.0, [], 0

    j3 = compute_ngram_jaccard(tokens_a, tokens_b, n=3)
    j4 = compute_ngram_jaccard(tokens_a, tokens_b, n=4)
    
    segments = extract_matching_segments(text_a, text_b, min_length=12)
    verbatim_chars = sum(seg["length"] for seg in segments)
    
    min_len = min(len(text_a.strip()), len(text_b.strip()))
    verbatim_ratio = min(1.0, verbatim_chars / max(1, min_len))
    
    # Weighted lexical score: combination of n-gram overlap and verbatim span ratio
    lexical_score = (0.35 * j3) + (0.25 * j4) + (0.40 * verbatim_ratio)
    return round(float(lexical_score), 4), segments, verbatim_chars


def evaluate_pair_similarity(text_a: str, text_b: str, semantic_sim: float) -> Dict[str, Any]:
    """
    Combines semantic embedding similarity with lexical sequence matching.
    Provides false-positive resistance: honest students answering a standard question
    will have high semantic similarity (~0.75-0.85) but low lexical/verbatim overlap (<0.25).
    Copied answers have high semantic AND high verbatim sequence matching.
    """
    clean_a = text_a.strip()
    clean_b = text_b.strip()
    
    if len(clean_a) < 10 or len(clean_b) < 10:
        return {
            "compositeScore": 0.0,
            "semanticScore": round(semantic_sim, 4),
            "lexicalScore": 0.0,
            "verbatimChars": 0,
            "riskLevel": "clean",
            "matchedSegments": [],
            "verbatimRatio": 0.0,
        }
        
    lexical_sim, segments, verbatim_chars = compute_lexical_similarity(clean_a, clean_b)
    min_len = min(len(clean_a), len(clean_b))
    verbatim_ratio = round(verbatim_chars / max(1, min_len), 4)

    # Composite score formulation:
    # 50% semantic + 50% lexical
    composite = (0.50 * semantic_sim) + (0.50 * lexical_sim)
    
    # Copying heuristics boost:
    # If more than 40% of the text is verbatim or multiple long phrases match
    if verbatim_ratio >= 0.40 or len(segments) >= 3:
        composite = min(1.0, composite + 0.12)
    elif verbatim_ratio >= 0.25:
        composite = min(1.0, composite + 0.06)

    composite = round(float(composite), 4)

    # Classify Risk Level
    if composite >= 0.82 or verbatim_ratio >= 0.55 or (semantic_sim >= 0.88 and lexical_sim >= 0.50):
        risk_level = "critical"      # Very likely copied / identical
    elif composite >= 0.70 or verbatim_ratio >= 0.28 or lexical_sim >= 0.35:
        risk_level = "suspicious"    # High similarity - review required
    else:
        risk_level = "clean"         # Normal independent student answer

    return {
        "compositeScore": composite,
        "semanticScore": round(float(semantic_sim), 4),
        "lexicalScore": lexical_sim,
        "verbatimChars": verbatim_chars,
        "verbatimRatio": verbatim_ratio,
        "riskLevel": risk_level,
        "matchedSegments": segments,
    }


def detect_similarity(
    exam_questions: list[dict],
    all_student_answers: list[dict],
    threshold: float = SIMILARITY_THRESHOLD,
) -> list[dict]:
    if len(all_student_answers) < 2:
        return []

    flagged = []

    for q_idx, question in enumerate(exam_questions, start=1):
        if question.get("type") == "mcq":
            continue

        q_id   = question.get("id", str(q_idx))
        q_text = question.get("questionText", "")

        student_records = []
        for student in all_student_answers:
            answer_map = {
                a["questionNumber"]: a["answerText"]
                for a in student.get("answers", [])
            }
            answer_text = answer_map.get(q_idx, "").strip()
            student_records.append({
                "name":          student["studentName"],
                "regNo":         student["registrationNo"],
                "answersheetId": student["answersheetId"],
                "answerText":    answer_text,
            })

        valid_records = [r for r in student_records if r["answerText"]]
        if len(valid_records) < 2:
            continue

        texts = [r["answerText"] for r in valid_records]
        embeddings = encode(texts)
        sim_matrix = pairwise_similarity_matrix(embeddings)

        N = len(valid_records)
        for i in range(N):
            for j in range(i + 1, N):
                sem_score = float(sim_matrix[i][j])
                text_a = valid_records[i]["answerText"]
                text_b = valid_records[j]["answerText"]
                
                analysis = evaluate_pair_similarity(text_a, text_b, sem_score)
                
                # Show only critical matches greater than 85% (> 0.85); ignore the rest
                if analysis["compositeScore"] > threshold:
                    flagged.append({
                        "questionId":      q_id,
                        "questionText":    q_text,
                        "questionNumber":  q_idx,
                        "studentA": {
                            "name":          valid_records[i]["name"],
                            "regNo":         valid_records[i]["regNo"],
                            "answersheetId": valid_records[i]["answersheetId"],
                            "answerText":    text_a,
                        },
                        "studentB": {
                            "name":          valid_records[j]["name"],
                            "regNo":         valid_records[j]["regNo"],
                            "answersheetId": valid_records[j]["answersheetId"],
                            "answerText":    text_b,
                        },
                        "similarityScore": analysis["compositeScore"],
                        "semanticScore":   analysis["semanticScore"],
                        "lexicalScore":    analysis["lexicalScore"],
                        "verbatimRatio":   analysis["verbatimRatio"],
                        "riskLevel":       analysis["riskLevel"],
                        "matchedSegments": analysis["matchedSegments"],
                    })

    flagged.sort(key=lambda x: x["similarityScore"], reverse=True)
    return flagged


def group_flagged_into_pairs(flagged_items: list[dict]) -> list[dict]:
    """
    Groups individual question flags into high-level student pairs for review.
    Enables side-by-side multi-question cheating verification.
    """
    pair_map: Dict[str, dict] = {}

    for item in flagged_items:
        # Canonical pair key using sorted registration numbers
        reg_a = item["studentA"]["regNo"]
        reg_b = item["studentB"]["regNo"]
        sorted_regs = sorted([reg_a, reg_b])
        pair_key = f"{sorted_regs[0]}__vs__{sorted_regs[1]}"

        if pair_key not in pair_map:
            pair_map[pair_key] = {
                "pairKey": pair_key,
                "studentA": item["studentA"],
                "studentB": item["studentB"],
                "questions": [],
                "scores": [],
                "riskLevels": [],
            }

        pair_map[pair_key]["questions"].append({
            "questionId":     item["questionId"],
            "questionNumber": item["questionNumber"],
            "questionText":   item["questionText"],
            "similarityScore": item["similarityScore"],
            "semanticScore":  item["semanticScore"],
            "lexicalScore":   item["lexicalScore"],
            "verbatimRatio":  item["verbatimRatio"],
            "riskLevel":      item["riskLevel"],
            "matchedSegments": item["matchedSegments"],
            "answerA":        item["studentA"]["answerText"],
            "answerB":        item["studentB"]["answerText"],
        })
        pair_map[pair_key]["scores"].append(item["similarityScore"])
        pair_map[pair_key]["riskLevels"].append(item["riskLevel"])

    grouped = []
    for pair_key, data in pair_map.items():
        avg_score = round(sum(data["scores"]) / len(data["scores"]), 4)
        # Show only critical match percent greater than 85% (> 0.85); ignore the rest
        if avg_score > 0.85:
            grouped.append({
                "pairKey":               pair_key,
                "studentA":              data["studentA"],
                "studentB":              data["studentB"],
                "overallSimilarity":     avg_score,
                "matchedQuestionsCount": len(data["questions"]),
                "riskLevel":             "critical",
                "questions":             data["questions"],
            })

    grouped.sort(key=lambda x: (x["riskLevel"] == "critical", x["overallSimilarity"]), reverse=True)
    return grouped


def summarise_flags(flagged_pairs: list[dict]) -> dict:
    students_involved = set()
    by_question: dict[str, dict] = {}

    for item in flagged_pairs:
        students_involved.add(item["studentA"]["regNo"])
        students_involved.add(item["studentB"]["regNo"])

        qid = item["questionId"]
        if qid not in by_question:
            by_question[qid] = {
                "questionId":   qid,
                "questionText": item["questionText"],
                "flagCount":    0,
            }
        by_question[qid]["flagCount"] += 1

    return {
        "totalFlaggedPairs": len(flagged_pairs),
        "studentsInvolved":  list(students_involved),
        "byQuestion":        list(by_question.values()),
    }
