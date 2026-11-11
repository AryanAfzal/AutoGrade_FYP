import os
import time
from pathlib import Path
from typing import Optional

import cv2
import fitz
import numpy as np


CANONICAL_W = 1600
CANONICAL_H = 2200
OPTION_LABELS = ["A", "B", "C", "D"]


def _order_quad_points(pts: np.ndarray) -> np.ndarray:
    """Orders 4 corner points as [top-left, top-right, bottom-right, bottom-left]."""
    rect = np.zeros((4, 2), dtype="float32")
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]  # top-left
    rect[2] = pts[np.argmax(s)]  # bottom-right
    diff = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(diff)]  # top-right
    rect[3] = pts[np.argmax(diff)]  # bottom-left
    return rect


def _find_corner_markers(gray: np.ndarray) -> Optional[np.ndarray]:
    """
    Finds the 4 solid black square registration markers in the 4 corners of the OMR sheet.
    Returns ordered 4x2 float32 array of marker centers, or None if not all 4 found.
    """
    h, w = gray.shape[:2]
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    min_area = (w * h) * 0.0004
    max_area = (w * h) * 0.015

    quadrants = {
        "tl": [],
        "tr": [],
        "bl": [],
        "br": [],
    }

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < min_area or area > max_area:
            continue

        x, y, bw, bh = cv2.boundingRect(cnt)
        if bh == 0 or bw == 0:
            continue
        aspect = bw / float(bh)
        if not (0.72 <= aspect <= 1.38):
            continue

        rect_area = bw * bh
        fill_solidity = area / float(rect_area)
        if fill_solidity < 0.72:
            continue

        cx = x + bw / 2.0
        cy = y + bh / 2.0

        if cx < w * 0.25 and cy < h * 0.20:
            quadrants["tl"].append((area, cx, cy))
        elif cx > w * 0.75 and cy < h * 0.20:
            quadrants["tr"].append((area, cx, cy))
        elif cx < w * 0.25 and cy > h * 0.80:
            quadrants["bl"].append((area, cx, cy))
        elif cx > w * 0.75 and cy > h * 0.80:
            quadrants["br"].append((area, cx, cy))

    if any(len(v) == 0 for v in quadrants.values()):
        return None

    # Pick largest solid square in each corner quadrant
    tl = max(quadrants["tl"], key=lambda item: item[0])
    tr = max(quadrants["tr"], key=lambda item: item[0])
    bl = max(quadrants["bl"], key=lambda item: item[0])
    br = max(quadrants["br"], key=lambda item: item[0])

    pts = np.array(
        [[tl[1], tl[2]], [tr[1], tr[2]], [br[1], br[2]], [bl[1], bl[2]]],
        dtype="float32",
    )
    return _order_quad_points(pts)


def _warp_to_canonical(img_bgr: np.ndarray) -> np.ndarray:
    """
    Deskews and normalizes the OMR sheet to (CANONICAL_W x CANONICAL_H) using
    the 4 corner registration squares, keeping a balanced margin so the header stays visible.
    """
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    corners = _find_corner_markers(gray)
    if corners is None:
        return cv2.resize(img_bgr, (CANONICAL_W, CANONICAL_H), interpolation=cv2.INTER_CUBIC)

    # Map the 4 corner marker centers to consistent canonical coordinates
    # Matching the sample sheet geometry (~8.5% horizontal margin, ~6.0% vertical margin)
    mx = CANONICAL_W * 0.085
    my = CANONICAL_H * 0.060
    dst = np.array(
        [
            [mx, my],
            [CANONICAL_W - mx, my],
            [CANONICAL_W - mx, CANONICAL_H - my],
            [mx, CANONICAL_H - my],
        ],
        dtype="float32",
    )
    matrix = cv2.getPerspectiveTransform(corners, dst)
    warped = cv2.warpPerspective(
        img_bgr,
        matrix,
        (CANONICAL_W, CANONICAL_H),
        flags=cv2.INTER_CUBIC,
        borderValue=(255, 255, 255),
    )
    return warped


def _detect_timing_rows(gray: np.ndarray) -> tuple[list[float], list[float]]:
    """
    Detects left and right timing dash Y-coordinates along the inner side borders.
    """
    h, w = gray.shape[:2]
    _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    left_ys: list[float] = []
    right_ys: list[float] = []

    for cnt in contours:
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bh <= 0 or bw <= 0:
            continue
        # Timing dashes are wider than tall rectangles in vertical question band
        if not (0.11 * h < y < 0.91 * h):
            continue
        if not (bw > bh * 1.4 and 18 <= bw <= 90 and 6 <= bh <= 35):
            continue
        area = cv2.contourArea(cnt)
        if area / float(bw * bh) < 0.65:
            continue

        cx = x + bw / 2.0
        cy = y + bh / 2.0
        if 0.06 * w < cx < 0.16 * w:
            left_ys.append(cy)
        elif 0.84 * w < cx < 0.94 * w:
            right_ys.append(cy)

    left_ys.sort()
    right_ys.sort()
    return left_ys, right_ys


def _cluster_values(vals: list[float], tol: float = 20.0) -> list[float]:
    if not vals:
        return []
    vals = sorted(vals)
    clusters: list[list[float]] = [[vals[0]]]
    for v in vals[1:]:
        if v - clusters[-1][-1] <= tol:
            clusters[-1].append(v)
        else:
            clusters.append([v])
    return [float(np.median(c)) for c in clusters]


def _detect_bubble_grid(gray: np.ndarray) -> tuple[dict[int, list[tuple[int, int, int]]], np.ndarray]:
    """
    Locates all 30 question rows (4 circular bubbles A, B, C, D each) in the canonical sheet.
    Combines circular bubble contour detection with timing-dash row alignment so every bubble
    (whether filled or empty) has an exact (cx, cy, radius).
    """
    h, w = gray.shape[:2]
    # Adaptive threshold captures both thin rings and solid dark filled circles
    binary = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY_INV,
        35,
        12,
    )
    # Close tiny gaps in printed bubble rings
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    bubbles: list[tuple[float, float, float]] = []
    for cnt in contours:
        x, y, bw, bh = cv2.boundingRect(cnt)
        if bh <= 0 or bw <= 0:
            continue
        if not (0.10 * h < y < 0.91 * h):
            continue
        if not (0.16 * w < x < 0.85 * w):
            continue
        # Bubble diameter on 1600x2200 is typically ~36-68px
        if not (28 <= bw <= 78 and 28 <= bh <= 78):
            continue
        aspect = bw / float(bh)
        if not (0.78 <= aspect <= 1.28):
            continue
        perim = cv2.arcLength(cnt, True)
        area = cv2.contourArea(cnt)
        if perim <= 0 or area <= 0:
            continue
        circularity = 4.0 * np.pi * area / (perim * perim)
        if circularity < 0.65:
            continue
        cx = x + bw / 2.0
        cy = y + bh / 2.0
        radius = (bw + bh) / 4.0
        bubbles.append((cx, cy, radius))

    # Median radius across all detected bubbles
    median_r = int(round(float(np.median([b[2] for b in bubbles])))) if bubbles else 24

    # Binary image for darkness measurement (Otsu on slightly blurred gray)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    _, dark_mask = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    left_timing_ys, right_timing_ys = _detect_timing_rows(gray)

    left_bubbles = [b for b in bubbles if b[0] < w * 0.50]
    right_bubbles = [b for b in bubbles if b[0] >= w * 0.50]

    def build_column_grid(
        col_bubbles: list[tuple[float, float, float]],
        timing_ys: list[float],
        start_q: int,
        default_x_range: tuple[float, float],
    ) -> dict[int, list[tuple[int, int, int]]]:
        # Determine 15 row Y-centers
        if len(timing_ys) == 15:
            row_ys = timing_ys
        else:
            clustered_ys = _cluster_values([b[1] for b in col_bubbles], tol=24.0)
            if len(clustered_ys) == 15:
                row_ys = clustered_ys
            elif len(timing_ys) >= 2:
                row_ys = list(np.linspace(timing_ys[0], timing_ys[-1], 15))
            elif len(clustered_ys) >= 2:
                row_ys = list(np.linspace(clustered_ys[0], clustered_ys[-1], 15))
            else:
                row_ys = list(np.linspace(h * 0.142, h * 0.880, 15))

        # Group bubbles into rows and cluster X into 4 option columns (A, B, C, D)
        all_xs: list[list[float]] = [[], [], [], []]
        row_matches: dict[int, list[tuple[float, float, float]]] = {}

        for r_idx, ry in enumerate(row_ys):
            row_items = [b for b in col_bubbles if abs(b[1] - ry) <= 22.0]
            row_items.sort(key=lambda b: b[0])
            row_matches[r_idx] = row_items
            if len(row_items) == 4:
                for opt_i in range(4):
                    all_xs[opt_i].append(row_items[opt_i][0])

        # Compute column X centers cleanly using median across full rows, else cluster all xs
        if all(len(xs) >= 2 for xs in all_xs):
            col_xs = [float(np.median(xs)) for xs in all_xs]
        else:
            clustered_xs = _cluster_values([b[0] for b in col_bubbles], tol=22.0)
            if len(clustered_xs) == 4:
                col_xs = clustered_xs
            else:
                col_xs = list(np.linspace(default_x_range[0], default_x_range[1], 4))

        col_grid: dict[int, list[tuple[int, int, int]]] = {}
        for r_idx, ry in enumerate(row_ys):
            q_num = start_q + r_idx
            items = row_matches.get(r_idx, [])
            pts: list[tuple[int, int, int]] = []
            for opt_i, cx_default in enumerate(col_xs):
                # Snap to exact detected bubble if within 16px, else use grid coordinate
                matched = min(
                    items,
                    key=lambda b: abs(b[0] - cx_default),
                    default=None,
                )
                if matched and abs(matched[0] - cx_default) <= 16.0:
                    pts.append((int(round(matched[0])), int(round(matched[1])), median_r))
                else:
                    pts.append((int(round(cx_default)), int(round(ry)), median_r))
            col_grid[q_num] = pts
        return col_grid

    grid: dict[int, list[tuple[int, int, int]]] = {}
    grid.update(build_column_grid(left_bubbles, left_timing_ys, 1, (w * 0.230, w * 0.390)))
    grid.update(build_column_grid(right_bubbles, right_timing_ys, 16, (w * 0.600, w * 0.760)))
    return grid, dark_mask


def _measure_bubble_fill(dark_mask: np.ndarray, cx: int, cy: int, r: int) -> float:
    """Measures proportion of dark pixels inside the inner 72% radius of a bubble."""
    h, w = dark_mask.shape[:2]
    inner_r = max(6, int(round(r * 0.72)))
    x1 = max(0, cx - inner_r)
    x2 = min(w, cx + inner_r + 1)
    y1 = max(0, cy - inner_r)
    y2 = min(h, cy + inner_r + 1)
    if x2 <= x1 or y2 <= y1:
        return 0.0

    roi = dark_mask[y1:y2, x1:x2]
    yy, xx = np.ogrid[y1:y2, x1:x2]
    circle_mask = ((xx - cx) ** 2 + (yy - cy) ** 2) <= (inner_r ** 2)
    total_px = int(np.count_nonzero(circle_mask))
    if total_px == 0:
        return 0.0
    dark_px = int(np.count_nonzero(roi[circle_mask]))
    return dark_px / float(total_px)


def _draw_circle_highlight(
    img: np.ndarray,
    cx: int,
    cy: int,
    r: int,
    bgr_color: tuple[int, int, int],
    thickness: int = 5,
    fill_alpha: float = 0.22,
    draw_x: bool = False,
):
    if fill_alpha > 0:
        overlay = img.copy()
        cv2.circle(overlay, (cx, cy), r + 4, bgr_color, -1)
        cv2.addWeighted(overlay, fill_alpha, img, 1.0 - fill_alpha, 0, img)

    cv2.circle(img, (cx, cy), r + 4, bgr_color, thickness, lineType=cv2.LINE_AA)
    if draw_x:
        d = int(round(r * 0.65))
        cv2.line(img, (cx - d, cy - d), (cx + d, cy + d), bgr_color, 4, lineType=cv2.LINE_AA)
        cv2.line(img, (cx - d, cy + d), (cx + d, cy - d), bgr_color, 4, lineType=cv2.LINE_AA)


def evaluate_omr_sheet(
    pdf_path: str,
    exam_questions: list[dict],
    output_image_path: str,
) -> dict:
    """
    Detects filled bubbles from an OMR MCQ sheet PDF, compares against exam_questions,
    renders a highlighted annotated PNG image showing right/wrong answers, and returns
    the evaluation entries matching AutoGrade's evaluation schema.
    """
    started_at = time.perf_counter()

    pdf = fitz.open(pdf_path)
    try:
        if len(pdf) == 0:
            raise ValueError("The OMR PDF contains no pages.")
        page = pdf[0]
        pix = page.get_pixmap(matrix=fitz.Matrix(3.0, 3.0), alpha=False)
        img_np = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
        img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
    finally:
        pdf.close()

    canonical = _warp_to_canonical(img_bgr)
    gray = cv2.cvtColor(canonical, cv2.COLOR_BGR2GRAY)
    grid, dark_mask = _detect_bubble_grid(gray)
    annotated = canonical.copy()

    # Colors in BGR
    GREEN = (52, 168, 34)      # Bright green for correct
    RED = (38, 38, 220)        # Bright red for wrong
    AMBER = (24, 152, 235)     # Amber for blank / multiple

    entries = []
    total_mark = 0.0
    total_max = 0
    correct_count = 0
    wrong_count = 0
    flagged_count = 0

    for idx, question in enumerate(exam_questions, start=1):
        max_marks = int(question.get("maxMarks", 1))
        total_max += max_marks
        correct_opt = (question.get("correctAnswer") or "").strip().upper()[:1]
        options_list = question.get("options") or []
        option_text_map = {
            (opt.get("label") or "").strip().upper(): (opt.get("text") or "").strip()
            for opt in options_list
        }

        coords = grid.get(idx, [])
        fill_ratios: dict[str, float] = {}
        for opt_i, label in enumerate(OPTION_LABELS):
            if opt_i < len(coords):
                cx, cy, r = coords[opt_i]
                fill_ratios[label] = round(_measure_bubble_fill(dark_mask, cx, cy, r), 3)
            else:
                fill_ratios[label] = 0.0

        sorted_opts = sorted(fill_ratios.items(), key=lambda kv: kv[1], reverse=True)
        best_opt, best_fill = sorted_opts[0]
        second_opt, second_fill = sorted_opts[1]

        # Classify marked state
        if best_fill < 0.36:
            status = "blank"
            selected_opt = ""
            confidence = round(max(0.0, 1.0 - best_fill), 3)
        elif second_fill >= 0.36 and (best_fill - second_fill) < 0.16:
            status = "multiple"
            selected_opt = f"{best_opt},{second_opt}"
            confidence = 0.25
        else:
            selected_opt = best_opt
            is_right = bool(correct_opt and selected_opt == correct_opt)
            status = "correct" if is_right else "wrong"
            confidence = round(min(1.0, max(0.5, (best_fill - second_fill) / 0.40)), 3)

        is_correct = status == "correct"
        is_flagged = status in ("blank", "multiple")
        ai_mark = float(max_marks) if is_correct else 0.0
        total_mark += ai_mark

        if is_correct:
            correct_count += 1
        else:
            wrong_count += 1
        if is_flagged:
            flagged_count += 1

        # Highlight bubbles directly on the annotated OMR sheet image
        if len(coords) == 4:
            if status == "correct":
                sel_idx = OPTION_LABELS.index(selected_opt)
                cx, cy, r = coords[sel_idx]
                _draw_circle_highlight(annotated, cx, cy, r, GREEN, thickness=5, fill_alpha=0.25)
                # Green check indicator to the right of option D
                d_cx, d_cy, d_r = coords[3]
                cv2.putText(
                    annotated,
                    "OK",
                    (d_cx + d_r + 14, d_cy + 8),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.65,
                    GREEN,
                    2,
                    cv2.LINE_AA,
                )
            elif status == "wrong":
                sel_idx = OPTION_LABELS.index(selected_opt)
                s_cx, s_cy, s_r = coords[sel_idx]
                _draw_circle_highlight(
                    annotated, s_cx, s_cy, s_r, RED, thickness=5, fill_alpha=0.25, draw_x=True
                )
                if correct_opt in OPTION_LABELS:
                    c_idx = OPTION_LABELS.index(correct_opt)
                    c_cx, c_cy, c_r = coords[c_idx]
                    _draw_circle_highlight(
                        annotated, c_cx, c_cy, c_r, GREEN, thickness=4, fill_alpha=0.14
                    )
                d_cx, d_cy, d_r = coords[3]
                cv2.putText(
                    annotated,
                    f"X ({correct_opt})",
                    (d_cx + d_r + 12, d_cy + 8),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    RED,
                    2,
                    cv2.LINE_AA,
                )
            else:
                # Blank or Multiple
                for opt_i, label in enumerate(OPTION_LABELS):
                    if fill_ratios[label] >= 0.36:
                        b_cx, b_cy, b_r = coords[opt_i]
                        _draw_circle_highlight(
                            annotated, b_cx, b_cy, b_r, AMBER, thickness=4, fill_alpha=0.22, draw_x=True
                        )
                if correct_opt in OPTION_LABELS:
                    c_idx = OPTION_LABELS.index(correct_opt)
                    c_cx, c_cy, c_r = coords[c_idx]
                    _draw_circle_highlight(
                        annotated, c_cx, c_cy, c_r, GREEN, thickness=4, fill_alpha=0.12
                    )
                d_cx, d_cy, d_r = coords[3]
                tag = "BLANK" if status == "blank" else "MULTI"
                cv2.putText(
                    annotated,
                    f"{tag} ({correct_opt})",
                    (d_cx + d_r + 10, d_cy + 7),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.55,
                    AMBER,
                    2,
                    cv2.LINE_AA,
                )

        if status == "blank":
            student_ans_display = "No bubble shaded (Blank)"
            feedback_msg = f"No option marked. Correct answer: {correct_opt}."
        elif status == "multiple":
            student_ans_display = f"Multiple bubbles marked ({selected_opt})"
            feedback_msg = f"Multiple options shaded ({selected_opt}). Correct answer: {correct_opt}."
        else:
            sel_text = option_text_map.get(selected_opt, "")
            student_ans_display = f"{selected_opt} — {sel_text}" if sel_text else selected_opt
            feedback_msg = (
                "Correct OMR bubble marked."
                if is_correct
                else f"Marked {selected_opt}, correct option is {correct_opt}."
            )

        corr_text = option_text_map.get(correct_opt, "")
        ref_display = f"{correct_opt} — {corr_text}" if corr_text else correct_opt

        entries.append(
            {
                "questionId": question.get("id", str(idx)),
                "questionText": question.get("questionText", f"Question {idx}"),
                "studentAnswer": student_ans_display,
                "referenceAnswer": ref_display,
                "aiMark": ai_mark,
                "maxMarks": max_marks,
                "confidence": confidence,
                "semanticScore": 1.0 if is_correct else 0.0,
                "keywordScore": 1.0 if is_correct else 0.0,
                "isCorrect": is_correct,
                "isFlagged": is_flagged,
                "type": "mcq",
                "feedback": feedback_msg,
                "omrDetails": {
                    "selectedOption": selected_opt,
                    "correctOption": correct_opt,
                    "fillRatios": fill_ratios,
                    "status": status,
                },
            }
        )

    # Draw subtle summary ribbon at bottom of annotated image
    summary_text = f"OMR SCORE: {int(total_mark) if total_mark.is_integer() else total_mark}/{total_max}   |   Correct: {correct_count}   |   Wrong: {wrong_count - flagged_count}   |   Flagged: {flagged_count}"
    cv2.rectangle(annotated, (int(CANONICAL_W * 0.14), CANONICAL_H - 95), (int(CANONICAL_W * 0.86), CANONICAL_H - 42), (245, 250, 251), -1)
    cv2.rectangle(annotated, (int(CANONICAL_W * 0.14), CANONICAL_H - 95), (int(CANONICAL_W * 0.86), CANONICAL_H - 42), (97, 84, 0), 2)
    cv2.putText(
        annotated,
        summary_text,
        (int(CANONICAL_W * 0.17), CANONICAL_H - 60),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.78,
        (97, 84, 0),
        2,
        cv2.LINE_AA,
    )

    os.makedirs(os.path.dirname(output_image_path), exist_ok=True)
    cv2.imwrite(output_image_path, annotated)

    print(
        f"[omr_grader] {Path(pdf_path).name}: score={total_mark}/{total_max}, "
        f"correct={correct_count}, wrong={wrong_count}, flagged={flagged_count}, "
        f"elapsed={time.perf_counter() - started_at:.2f}s"
    )

    return {
        "totalMark": round(total_mark, 2),
        "totalMaxMarks": total_max,
        "omrAnnotatedPath": output_image_path,
        "entries": entries,
    }
