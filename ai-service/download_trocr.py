from pathlib import Path

from transformers import RobertaTokenizer, ViTImageProcessor, VisionEncoderDecoderModel

MODEL_NAME = "microsoft/trocr-base-handwritten"
TARGET_DIR = Path(__file__).resolve().parent / "model_files" / "trocr-base-handwritten"


def main() -> None:
    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {MODEL_NAME} to {TARGET_DIR}")

    ViTImageProcessor.from_pretrained(MODEL_NAME).save_pretrained(TARGET_DIR)
    RobertaTokenizer.from_pretrained(MODEL_NAME).save_pretrained(TARGET_DIR)
    VisionEncoderDecoderModel.from_pretrained(MODEL_NAME).save_pretrained(TARGET_DIR)

    print("TrOCR model files saved.")


if __name__ == "__main__":
    main()
