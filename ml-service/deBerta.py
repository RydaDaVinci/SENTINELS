from transformers import AutoTokenizer, AutoModelForSequenceClassification
import os

# Create a directory to store the model
model_dir = "deberta_emotion_model"
os.makedirs(model_dir, exist_ok=True)

# Download and save the model and tokenizer
model_name = "ayoubkirouane/BERT-Emotions-Classifier"
print(f"Downloading {model_name}...")

tokenizer = AutoTokenizer.from_pretrained(model_name)
model = AutoModelForSequenceClassification.from_pretrained(model_name)

# Save locally
print(f"Saving to {model_dir}...")
tokenizer.save_pretrained(model_dir)
model.save_pretrained(model_dir)

print(f"✅ Model saved to {model_dir}")
print(f"Files saved: {os.listdir(model_dir)}")