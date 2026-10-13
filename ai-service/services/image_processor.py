import cv2


def preprocess_image(image_path: str) -> str:
    image = cv2.imread(image_path)
    if image is None:
        return image_path

    height, width = image.shape[:2]
    longest_dimension = max(height, width)
    if longest_dimension < 2200:
        scale = 2200.0 / float(longest_dimension)
        image = cv2.resize(
            image,
            (int(width * scale), int(height * scale)),
            interpolation=cv2.INTER_CUBIC,
        )

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
    denoised = cv2.bilateralFilter(gray, d=5, sigmaColor=40, sigmaSpace=40)
    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)
    gaussian = cv2.GaussianBlur(enhanced, (0, 0), sigmaX=1.5)
    sharpened = cv2.addWeighted(enhanced, 1.25, gaussian, -0.25, 0)

    cv2.imwrite(image_path, sharpened)
    return image_path


def preprocess_all_images(image_paths: list[str]) -> list[str]:
    return [preprocess_image(path) for path in image_paths]
