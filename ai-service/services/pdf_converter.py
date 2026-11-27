import os
import fitz


def convert_pdf_to_images(pdf_path: str, output_folder: str = "processed") -> list[str]:
    os.makedirs(output_folder, exist_ok=True)

    pdf = fitz.open(pdf_path)
    image_paths = []

    try:
        for page_number in range(len(pdf)):
            page = pdf[page_number]

            # Render at 144 DPI (Matrix 2.0, 2.0), providing crisp readability
            # while keeping bitmap memory under 6MB per page (fits in 512MB RAM).
            matrix = fitz.Matrix(2.0, 2.0)
            image = page.get_pixmap(matrix=matrix)

            image_path = os.path.join(output_folder, f"page_{page_number + 1}.png")
            image.save(image_path)
            image_paths.append(image_path)
    finally:
        pdf.close()

    return image_paths
