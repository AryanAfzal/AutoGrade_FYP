import os

import fitz


def convert_pdf_to_images(pdf_path: str, output_folder: str = "processed") -> list[str]:
    os.makedirs(output_folder, exist_ok=True)

    pdf = fitz.open(pdf_path)
    image_paths = []

    try:
        for page_number in range(len(pdf)):
            page = pdf[page_number]

            # Render at 288 DPI, matching the source OCR project's handwriting pipeline.
            matrix = fitz.Matrix(4.0, 4.0)
            image = page.get_pixmap(matrix=matrix)

            image_path = os.path.join(output_folder, f"page_{page_number + 1}.png")
            image.save(image_path)
            image_paths.append(image_path)
    finally:
        pdf.close()

    return image_paths
